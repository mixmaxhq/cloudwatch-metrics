/**
 * This module provides a simplified wrapper for creating and publishing
 * CloudWatch metrics. We should always initialize our environment first:
 *
 * ```
 * var cloudwatchMetrics = require('cloudwatch-metrics');
 * cloudwatchMetrics.initialize({
 * 	region: 'us-east-1'
 * });
 * ```
 *
 * For creating a metric, we simply need to provide the
 * namespace and the type of metric:
 *
 * ```
 * 	var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count');
 * ```
 *
 * If we want to add our own default dimensions, such as environment information,
 * we can add it in the following manner:
 *
 * ```
 * var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
 * 	Name: 'environment',
 * 	Value: 'PROD'
 * }]);
 * ```
 *
 * If we want to disable a metric in certain environments (such as local development),
 * we can make the metric in the following manner:
 *
 * ```
 * // isLocal is a boolean
 * var isLocal = someWayOfDetermingIfLocal();
 *
 * var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
 * 	Name: 'environment',
 * 	Value: 'PROD'
 * }], {
 * 	enabled: isLocal
 * });
 * ```
 *
 * Then, whenever we want to publish a metric, we simply do:
 *
 * ```
 * myMetric.put(value, metric, additionalDimensions);
 * ```
 *
 * Be aware that the `put` call does not actually send the metric to CloudWatch
 * at that moment. Instead, it stores unsent metrics and sends them to
 * CloudWatch on a predetermined interval (to help get around sending too many
 * metrics at once - CloudWatch limits you by default to 150 put-metric data
 * calls per second). The default interval is 5 seconds, if you want metrics
 * sent at a different interval, then provide that option when construction your
 * CloudWatch Metric:
 *
 * ```
 * var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
 * 	Name: 'environment',
 * 	Value: 'PROD'
 * }], {
 * 	sendInterval: 3 * 1000 // It's specified in milliseconds.
 * });
 * ```
 *
 * You can also register a callback to be called when we actually send metrics
 * to CloudWatch - this can be useful for logging put-metric-data errors:
 * ```
 * var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
 * 	Name: 'environment',
 * 	Value: 'PROD'
 * }], {
 * 	sendCallback: (err) => {
 * 		if (!err) return;
 * 		// Do your error handling here.
 * 	}
 * });
 * ```
 */

var { CloudWatchClient, PutMetricDataCommand }= require('@aws-sdk/client-cloudwatch');
const SummarySet = require('./src/summarySet');

var _awsConfig = {region: 'us-east-1'};
/**
 * setIndividialConfig sets the default configuration to use when creating AWS
 * metrics. It defaults to simply setting the AWS region to `us-east-1`, i.e.:
 *
 * {
 * 	region: 'us-east-1'
 * }
 * @param {Object} config The AWS SDK configuration options one would like to set.
 */
function initialize(config) {
  _awsConfig = config;
}

const DEFAULT_METRIC_OPTIONS = {
  enabled: true,
  sendInterval: 5000,
  summaryInterval: 10000,
  sendCallback: () => {},
  maxCapacity: 20,
  withTimestamp: false,
  storageResolution: undefined
};

/**
 * Create a custom CloudWatch Metric object that sets pre-configured dimensions and allows for
 * customized metricName and units. Each CloudWatchMetric object has it's own internal
 * CloudWatchClient object to prevent errors due to overlapping callings to
 * CloudWatchClient#send.
 *
 * @param {String} namespace         CloudWatch namespace
 * @param {String} units             CloudWatch units
 * @param {Object} defaultDimensions (optional) Any default dimensions we'd
 *    like the metric to have.
 * @param {Object} options           (optional) Options used to control metric
 *    behavior.
 *   @param {Bool} options.enabled   Defaults to true, controls whether we
 *      publish the metric when `Metric#put()` is called - this is useful for
 *      turning off metrics in specific environments.
 */
function Metric(namespace, units, defaultDimensions, options) {
  var self = this;
  self.cloudwatch = new CloudWatchClient(_awsConfig);
  self.namespace = namespace;
  self.units = units;
  self.defaultDimensions = defaultDimensions || [];
  self.options = Object.assign({}, DEFAULT_METRIC_OPTIONS, options);
  self._storedMetrics = [];
  this._summaryData = new Map();

  if (self.options.enabled) {
    self._interval = global.setInterval(() => {
      self._sendMetrics();
    }, self.options.sendInterval);

    this._summaryInterval = global.setInterval(() => {
      this._summarizeMetrics();
    }, this.options.summaryInterval);
  }
}

/**
 * Publish this data to Cloudwatch
 * @param {Integer|Long} value          Data point to submit
 * @param {String} namespace            Name of the metric
 * @param {String} units                CloudWatch units
 * @param {Array} [additionalDimensions]  Array of additional CloudWatch metric dimensions. See
 * http://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Dimension.html for details.
 */
Metric.prototype.put = function(...args) {
  if (args.length === 3) {
    const [value, metricName] = args;
    const shouldInheritUnits = Array.isArray(args[2]);
    const units = shouldInheritUnits ? this.units : args[2];
    const additionalDimensions = shouldInheritUnits ? args[2] : [];
    return this._put(value, metricName, units, additionalDimensions);
  } else if (args.length === 2) {
    return this._put(...args, this.units);
  }
  return this._put(...args);
};

Metric.prototype._put = function(value, metricName, units, additionalDimensions = []) {
  var self = this;
  // Only publish if we are enabled
  if (self.options.enabled) {
    var payload = {
      MetricName: metricName,
      Dimensions: self.defaultDimensions.concat(additionalDimensions),
      Unit: units,
      Value: value
    };
    if (this.options.withTimestamp) {
      payload.Timestamp = new Date();
    }
    if (this.options.storageResolution) {
      payload.StorageResolution = this.options.storageResolution;
    }

    self._storedMetrics.push(payload);

    // We need to see if we're at our maxCapacity, if we are - then send the
    // metrics now.
    if (self._storedMetrics.length === self.options.maxCapacity) {
      global.clearInterval(self._interval);
      self._sendMetrics();
      self._interval = global.setInterval(() => {
        self._sendMetrics();
      }, self.options.sendInterval);
    }
  }
};

/**
 * Summarize the data using a statistic set and put it on the configured summary interval. This will
 * cause Cloudwatch to be unable to track the value distribution, so it'll only show summation and
 * bounds. The order of additionalDimensions is important, and rearranging the order will cause the
 * Metric instance to track those two summary sets independently!
 * @param {Number} value The value to include in the summary.
 * @param {String} metricName The name of the metric we're summarizing.
 * @param {String} units CloudWatch units
 * @param {Object[]} additionalDimensions The extra dimensions we're tracking.
 */
Metric.prototype.summaryPut = function(...args) {
  if (args.length === 3) {
    const [value, metricName] = args;
    const shouldInheritUnits = Array.isArray(args[2]);
    const units = shouldInheritUnits ? this.units : args[2];
    const additionalDimensions = shouldInheritUnits ? args[2] : [];
    return this._summaryPut(value, metricName, units, additionalDimensions);
  } else if (args.length === 2) {
    return this._summaryPut(...args, this.units, []);
  }
  return this._summaryPut(...args);
};

Metric.prototype._summaryPut = function(value, metricName, units, additionalDimensions = []) {
  const key = makeKey(metricName, units, additionalDimensions);
  const entry = this._summaryData.get(key);

  let set;
  if (entry) {
    set = entry[3];
  } else {
    set = new SummarySet();
    const allDimensions = [...this.defaultDimensions, ...additionalDimensions];
    this._summaryData.set(key, [metricName, units, allDimensions, set]);
  }
  set.put(value);
};

/**
 * Samples a metric so that we send the metric to Cloudwatch at the given
 * sampleRate.
 * @param {Integer|Long} value          Data point to submit
 * @param {String} namespace            Name of the metric
 * @param {String} units                CloudWatch units
 * @param {Array} additionalDimensions  Array of additional CloudWatch metric dimensions. See
 * http://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Dimension.html for details.
 * @param  {Float} sampleRate           The rate at which to sample the metric at.
 *    The sample rate must be between 0.0 an 1.0. As an example, if you provide
 *    a sampleRate of 0.1, then we will send the metric to Cloudwatch 10% of the
 *    time.
 */
Metric.prototype.sample = function(...args) {
  if (args.length === 4) {
    const [value, metricName, additionalDimensions, sampleRate] = args;
    const units = this.units;
    return this._sample(value, metricName, units, additionalDimensions, sampleRate);
  }

  return this.prototype._sample(...args);
};

Metric.prototype._sample = function(value, metricName, units, additionalDimensions, sampleRate) {
  sampleRate = Array.isArray(additionalDimensions) ? sampleRate : additionalDimensions;
  if (Math.random() < sampleRate) this.put(value, metricName, units, additionalDimensions);
};

/**
 * _sendMetrics is called on a specified interval (defaults to 5 seconds but
 * can be overridden but providing a `sendInterval` option when creating a
 * Metric). It is what actually sends metrics to CloudWatch. It passes the
 * sendCallback option (if provided) as the callback to the put-metric-data
 * call. This can be useful for logging AWS errors.
 */
Metric.prototype._sendMetrics = function() {
  var self = this;
  // NOTE: this would be racy except that NodeJS is single threaded.
  const dataPoints = self._storedMetrics;
  self._storedMetrics = [];

  if (!dataPoints || !dataPoints.length) return;
  self.cloudwatch.send(new PutMetricDataCommand({
    MetricData: dataPoints,
    Namespace: self.namespace
  }), self.options.sendCallback);
};

/**
 * Shuts down metric service by clearing any outstanding timer and sending any existing metrics
 */
Metric.prototype.shutdown = function() {
  global.clearInterval(this._interval);
  global.clearInterval(this._summaryInterval);

  this._sendMetrics();
  this._summarizeMetrics();
};

/**
 * Gets whether outstanding metrics exist or not.
 *
 * @return {boolean}
 */
Metric.prototype.hasMetrics = function() {
  return !!this._storedMetrics.length;
};

/**
 * _summarizeMetrics is called on a specified interval (default, 10 seconds). It
 * sends summarized statistics to Cloudwatch.
 */
Metric.prototype._summarizeMetrics = function() {
  const summaryEntries = this._summaryData.values();
  const dataPoints = [];
  for (const [MetricName, Unit, Dimensions, set] of summaryEntries) {
    if (!set.size) continue;

    dataPoints.push({
      MetricName,
      Dimensions,
      StatisticValues: set.get(),
      Unit,
    });

    if (dataPoints.length === this.options.maxCapacity) {
      // Put a copy of the points we've gathered, then empty the array so we can
      // get more.
      this._putSummaryMetrics(dataPoints.slice());
      dataPoints.length = 0;
    }
  }

  if (dataPoints.length) {
    this._putSummaryMetrics(dataPoints);
  }
};

/**
 * Put a single batch of summarized metrics to Cloudwatch. This helps avoid
 * hitting the Cloudwatch per-call maximum.
 */
Metric.prototype._putSummaryMetrics = function(MetricData) {
  this.cloudwatch.send(new PutMetricDataCommand({
    MetricData,
    Namespace: this.namespace,
  }), this.options.sendCallback);
};

/**
 * Make a key for a given metric name and some dimensions. This works on the
 * assumption that sane people won't put a null character in their metric name
 * or dimension name/value.
 *
 * @param {String} metricName
 * @param {String} units
 * @param {Object[]} dimensions
 * @returns {String} Something we can actually use as a Map key.
 */
function makeKey(metricName, units, dimensions) {
  let key = `${metricName}\0${units}`;
  for (const {Name, Value} of dimensions) {
    key += `\0${Name}\0${Value}`;
  }
  return key;
}

module.exports = {
  initialize,
  Metric
};
