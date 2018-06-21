/* globals describe, afterEach, it, expect, spyOn, jasmine */

var _ = require('underscore');

var rewire = require('rewire');
var cloudwatchMetric = rewire('../..');

describe('cloudwatch-metrics', function() {
  var restoreAWS;

  function attachHook(hook) {
    restoreAWS = cloudwatchMetric.__set__('AWS', {
      CloudWatch: function() {
        this.putMetricData = hook;
      }
    });
  }

  afterEach(function() {
    if (restoreAWS) {
      restoreAWS();
      restoreAWS = null;
    }
  });

  describe('put', function() {
    it('should buffer until timeout', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual({
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Timestamp: jasmine.any(Number),
            Unit: 'Count',
            Value: 1
          }],
          Namespace: 'namespace'
        });
        cb();
      });

      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000,
        sendCallback: done
      });

      metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
    });

    it('should call continually', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual({
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Timestamp: jasmine.any(Number),
            Unit: 'Count',
            Value: 1
          }],
          Namespace: 'namespace'
        });
        cb();
      });

      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 500,
        sendCallback: _.after(3, done)
      });

      var interval;
      var stop = _.after(3, () => clearInterval(interval));
      interval = setInterval(function() {
        metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
        stop();
      }, 400);
    });

    it('should buffer until the cap is hit', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual({
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Timestamp: jasmine.any(Number),
            Unit: 'Count',
            Value: 1
          }, {
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Timestamp: jasmine.any(Number),
            Unit: 'Count',
            Value: 2
          }],
          Namespace: 'namespace'
        });
        cb();
      });

      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 3000, // mocha defaults to a 2 second timeout so setting
        // larger than that will cause the test to fail if we
        // hit the timeout
        sendCallback: done,
        maxCapacity: 2
      });

      metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
      metric.put(2, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
    });
  });

  describe('sample', function() {
    it('should ignore metrics when not in the sample range', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      spyOn(Math, 'random').and.returnValue(0.5);
      spyOn(metric, 'put');

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).not.toHaveBeenCalled();
    });

    it('should call put when the we decide to sample a metric', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      spyOn(Math, 'random').and.returnValue(0.1);
      // Just so we don't send anything to AWS.
      spyOn(metric, 'put').and.returnValue(undefined);

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).toHaveBeenCalled();
    });
  });
});
