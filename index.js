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

var AWS = require('aws-sdk');

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
  sendCallback: () => {},
  maxCapacity: 20
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
  var self = this;
  self.cloudwatch = new AWS.CloudWatch(_awsConfig);
  self.namespace = namespace;
  self.units = units;
  self.defaultDimensions = defaultDimensions || [];
  self.options = Object.assign({}, DEFAULT_METRIC_OPTIONS, options);
  self._storedMetrics = [];

  if (self.options.enabled) {
    self._interval = setInterval(() => {
      self._sendMetrics();
    }, self.options.sendInterval);
  }
}

/**
 * Publish this data to Cloudwatch
 * @param {Integer|Long} value          Data point to submit
 * @param {String} namespace            Name of the metric
 * @param {Array} additionalDimensions  Array of additional CloudWatch metric dimensions. See
 * http://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_Dimension.html for details.
 */
Metric.prototype.put = function(value, metricName, additionalDimensions) {
  var self = this;
  // Only publish if we are enabled
  if (self.options.enabled) {
    additionalDimensions = additionalDimensions || [];
    self._storedMetrics.push({
      MetricName: metricName,
      Dimensions: self.defaultDimensions.concat(additionalDimensions),
      Unit: self.units,
      Value: value
    });

    // We need to see if we're at our maxCapacity, if we are - then send the
    // metrics now.
    if (self._storedMetrics.length === self.options.maxCapacity) {
      clearInterval(self._interval);
      self._sendMetrics();
      self._interval = setInterval(() => {
        self._sendMetrics();
      }, self.options.sendInterval);
    }
  }
};

/**
 * Samples a metric so that we send the metric to Cloudwatch at the given
 * sampleRate.
 * @param {Integer|Long} value          Data point to submit
 * @param {String} namespace            Name of the metric
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
  var self = this;
  // NOTE: this would be racy except that NodeJS is single threaded.
  const dataPoints = self._storedMetrics;
  self._storedMetrics = [];

  if (!dataPoints || !dataPoints.length) return;

  self.cloudwatch.putMetricData({
    MetricData: dataPoints,
    Namespace: self.namespace
  }, self.options.sendCallback);
};

/**
 * Shuts down metric service by clearing any outstanding timer and sending any existing metrics
 */
Metric.prototype.shutdown = function() {
  clearInterval(this._interval);
  this._sendMetrics();
};

/**
 * Gets whether outstanding metrics exist or not
 */
Metric.prototype.hasMetrics = function() {
  return !!this._storedMetrics.length;
};

module.exports = {
  initialize,
  Metric
};
