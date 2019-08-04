/**
 * This module provides a simplified wrapper for creating and publishing
 * CloudWatch metrics. We should always initialize our environment first:
 *
 * ```
 * const cloudwatchMetrics = require('cloudwatch-metrics');
 * cloudwatchMetrics.initialize({
 * 	region: 'us-east-1'
 * });
 * ```
 *
 * For creating a metric, we simply need to provide the
 * namespace and the type of metric:
 *
 * ```
 * 	const myMetric = new cloudwatchMetrics.Metric('namespace', 'Count');
 * ```
 *
 * If we want to add our own default dimensions, such as environment information,
 * we can add it in the following manner:
 *
 * ```
 * const myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
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
 * const isLocal = someWayOfDetermingIfLocal();
 *
 * const myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
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
 * const myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
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
 * const myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
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

let CloudWatch = require('aws-sdk/clients/cloudwatch');
const SummarySet = require('./src/summarySet');

let _awsConfig = {region: 'us-east-1'};
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
 * AWS.CloudWatch object to prevent errors due to overlapping callings to
 * AWS.CloudWatch#putMetricData.
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
  this.cloudwatch = new CloudWatch(_awsConfig);
  this.namespace = namespace;
  this.units = units;
  this.defaultDimensions = defaultDimensions || [];
  this.options = Object.assign({}, DEFAULT_METRIC_OPTIONS, options);
  this.options.maxCapacity = Math.min(DEFAULT_METRIC_OPTIONS.maxCapacity, this.options.maxCapacity);
  this._storedMetrics = [];
  this._summaryData = new Map();

  if (this.options.enabled) {
    this._interval = setInterval(() => {
      this._sendMetrics();
    }, this.options.sendInterval);

    this._summaryInterval = setInterval(() => {
      this._summarizeMetrics();
    }, this.options.summaryInterval);
  }
}

/**
 * Publish this data to Cloudwatch
 * @param {Integer|Long} value          Data point to submit
 * @param {String} metricName           Name of the metric
 * @param {Array} additionalDimensions  Array of additional CloudWatch metric dimensions. See
 * http://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Dimension.html for details.
 */
Metric.prototype.put = function(value, metricName, additionalDimensions) {
  // Only publish if we are enabled
  if (this.options.enabled) {
    additionalDimensions = additionalDimensions || [];
    let payload = {
      MetricName: metricName,
      Dimensions: this.defaultDimensions.concat(additionalDimensions),
      Unit: this.units,
      Value: value
    };
    if (this.options.withTimestamp) {
      payload.Timestamp = new Date().toISOString();
    }
    if (this.options.storageResolution) {
      payload.StorageResolution = this.options.storageResolution;
    }

    this._storedMetrics.push(payload);

    // We need to see if we're at our maxCapacity, if we are - then send the
    // metrics now.
    if (this._storedMetrics.length === this.options.maxCapacity) {
      clearInterval(this._interval);
      this._sendMetrics();
      this._interval = setInterval(() => {
        this._sendMetrics();
      }, this.options.sendInterval);
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
 * @param {Object[]} additionalDimensions The extra dimensions we're tracking.
 */
Metric.prototype.summaryPut = function(value, metricName, additionalDimensions = []) {
  const key = makeKey(metricName, additionalDimensions);
  const entry = this._summaryData.get(key);

  let set;
  if (entry) {
    set = entry[2];
  } else {
    set = new SummarySet();
    const allDimensions = [...this.defaultDimensions, ...additionalDimensions];
    this._summaryData.set(key, [metricName, allDimensions, set]);
  }
  set.put(value);
};

/**
 * Samples a metric so that we send the metric to Cloudwatch at the given
 * sampleRate.
 * @param {Integer|Long} value          Data point to submit
 * @param {String} metricName            Name of the metric
 * @param {Array} additionalDimensions  Array of additional CloudWatch metric dimensions. See
 * http://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Dimension.html for details.
 * @param  {Float} sampleRate           The rate at which to sample the metric at.
 *    The sample rate must be between 0.0 an 1.0. As an example, if you provide
 *    a sampleRate of 0.1, then we will send the metric to Cloudwatch 10% of the
 *    time.
 */
Metric.prototype.sample = function(value, metricName, additionalDimensions, sampleRate) {
  if (Math.random() < sampleRate) this.put(value, metricName, additionalDimensions);
};

/**
 * _sendMetrics is called on a specified interval (defaults to 5 seconds but
 * can be overridden but providing a `sendInterval` option when creating a
 * Metric). It is what actually sends metrics to CloudWatch. It passes the
 * sendCallback option (if provided) as the callback to the put-metric-data
 * call. This can be useful for logging AWS errors.
 */
Metric.prototype._sendMetrics = function() {
  // NOTE: this would be racy except that NodeJS is single threaded.
  const dataPoints = this._storedMetrics;
  this._storedMetrics = [];

  if (!dataPoints || !dataPoints.length) return;

  this.cloudwatch.putMetricData({
    MetricData: dataPoints,
    Namespace: this.namespace
  }, this.options.sendCallback);
};

/**
 * Shuts down metric service by clearing any outstanding timer and sending any existing metrics
 */
Metric.prototype.shutdown = function() {
  clearInterval(this._interval);
  clearInterval(this._summaryInterval);
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
  for (const [MetricName, Dimensions, set] of summaryEntries) {
    if (!set.size) continue;

    dataPoints.push({
      MetricName,
      Dimensions,
      StatisticValues: set.get(),
      Unit: this.units,
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
  this.cloudwatch.putMetricData({
    MetricData,
    Namespace: this.namespace,
  }, this.options.sendCallback);
};

/**
 * Make a key for a given metric name and some dimensions. This works on the
 * assumption that sane people won't put a null character in their metric name
 * or dimension name/value.
 *
 * @param {String} metricName
 * @param {Object[]} dimensions
 * @returns {String} Something we can actually use as a Map key.
 */
function makeKey(metricName, dimensions) {
  let key = metricName;
  for (const {Name, Value} of dimensions) {
    key += `\0${Name}\0${Value}`;
  }
  return key;
}

module.exports = {
  initialize,
  Metric
};
