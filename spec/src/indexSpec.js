/* globals describe, beforeEach, afterEach, it, expect, spyOn, jasmine */

var _ = require('underscore');

var rewire = require('rewire');
var cloudwatchMetric = rewire('../..');

describe('cloudwatch-metrics', function() {
  var restoreAWS, metric;

  function attachHook(hook) {
    restoreAWS = cloudwatchMetric.__set__('CloudWatchClient', function() {
      this.send = hook;
    });
  }

  afterEach(function() {
    if (restoreAWS) {
      restoreAWS();
      restoreAWS = null;
    }

    if (metric) {
      metric.shutdown();
    }
  });

  describe('put', function() {
    it('should buffer until timeout', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Unit: 'Count',
            Value: 1
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Unit: 'Count',
            Value: 1
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
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
            Unit: 'Count',
            Value: 2
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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

    it('should set a Timestamp if specified in the options', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Unit: 'Count',
            Timestamp: jasmine.any(String),
            Value: 1
          }],
          Namespace: 'namespace'
        }}));
        expect(Date.parse(data.input.MetricData[0].Timestamp)).toBeLessThanOrEqual(Date.now());
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        withTimestamp: true,
        sendInterval: 1000, // mocha defaults to a 2 second timeout so setting
        // larger than that will cause the test to fail if we
        // hit the timeout
        sendCallback: done,
      });

      metric.put(1, 'metricName', [{Name: 'ExtraDimension', Value: 'Value'}]);
    });

    it('should set a StorageResolution if specified in the options', function(done) {
      attachHook(function(data, cb) {
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Unit: 'Count',
            StorageResolution: 1,
            Value: 1
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        storageResolution: 1,
        sendInterval: 1000, // mocha defaults to a 2 second timeout so setting
        // larger than that will cause the test to fail if we
        // hit the timeout
        sendCallback: done,
      });

      metric.put(1, 'metricName', [{Name: 'ExtraDimension', Value: 'Value'}]);
    });

    it('should override the Unit from the namespace if specified in the put call', function (done) {
      attachHook(function (data, cb) {
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'metricName',
            Unit: 'Percent',
            Value: 1
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000,
        sendCallback: done,
      });

      metric.put(1, 'metricName', 'Percent', [{ Name: 'ExtraDimension', Value: 'Value' }]);
    });
  });

  describe('sample', function() {
    it('should ignore metrics when not in the sample range', function() {
      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      spyOn(Math, 'random').and.returnValue(0.5);
      spyOn(metric, 'put');

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).not.toHaveBeenCalled();
    });

    it('should call put when the we decide to sample a metric', function() {
      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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

  describe('summaryPut', function() {
    it('should not call with no data', function(done) {
      attachHook(() => {
        throw new Error('should not get send callback');
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD',
      }], {
        summaryInterval: 100,
        sendCallback() {
          throw new Error('should not get send callback');
        },
      });

      spyOn(metric, '_summarizeMetrics');

      setTimeout(() => {
        expect(metric._summarizeMetrics).toHaveBeenCalled();
        done();
      }, 250);
    });

    it('should call with summary', function(done) {
      let hookCalls = 0;
      attachHook((data, cb) => {
        ++hookCalls;
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'some-metric',
            Unit: 'Count',
            StatisticValues: {
              Minimum: 12,
              Maximum: 13,
              Sum: 25,
              SampleCount: 2,
            },
          }, {
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'some-other-metric',
            Unit: 'Count',
            StatisticValues: {
              Minimum: 2,
              Maximum: 2,
              Sum: 2,
              SampleCount: 1,
            },
          }, {
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'a-metric-with-different-unit',
            Unit: 'Percent',
            StatisticValues: {
              Minimum: 5,
              Maximum: 5,
              Sum: 5,
              SampleCount: 1,
            },
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD',
      }], {
        summaryInterval: 100,
        sendCallback() {
          expect(hookCalls).toBe(1);
          done();
        },
      });

      metric.summaryPut(12, 'some-metric', [{ Name: 'ExtraDimension', Value: 'Value' }]);
      metric.summaryPut(2, 'some-other-metric', [{ Name: 'ExtraDimension', Value: 'Value' }]);
      metric.summaryPut(5, 'a-metric-with-different-unit', 'Percent', [{ Name: 'ExtraDimension', Value: 'Value' }]);
      setTimeout(() => {
        metric.summaryPut(13, 'some-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
      }, 50);
    });

    it('should call after no data', function(done) {
      let hookCalls = 0;
      attachHook((data, cb) => {
        ++hookCalls;
        expect(data).toEqual(jasmine.objectContaining({input: {
          MetricData: [{
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'some-metric',
            Unit: 'Count',
            StatisticValues: {
              Minimum: 12,
              Maximum: 13,
              Sum: 25,
              SampleCount: 2,
            },
          }, {
            Dimensions: [{
              Name: 'environment',
              Value: 'PROD'
            }, {
              Name: 'ExtraDimension',
              Value: 'Value'
            }],
            MetricName: 'some-other-metric',
            Unit: 'Count',
            StatisticValues: {
              Minimum: 2,
              Maximum: 2,
              Sum: 2,
              SampleCount: 1,
            },
          }],
          Namespace: 'namespace'
        }}));
        cb();
      });

      metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD',
      }], {
        summaryInterval: 200,
        sendCallback() {
          expect(hookCalls).toBe(1);
          done();
        },
      });

      setTimeout(() => {
        metric.summaryPut(12, 'some-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
        metric.summaryPut(2, 'some-other-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
        setTimeout(() => {
          metric.summaryPut(13, 'some-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
        }, 50);
      }, 300);
    });
  });

  describe('shutdown', function () {
    let setIntervalSpy, clearIntervalSpy;

    beforeEach(function () {
      setIntervalSpy = jasmine.createSpy('setInterval');
      clearIntervalSpy = jasmine.createSpy('clearInterval');
      spyOn(global, 'setInterval').and.callFake(setIntervalSpy);
      spyOn(global, 'clearInterval').and.callFake(clearIntervalSpy);
    });

    afterEach(function () {
      setIntervalSpy.calls.reset();
      clearIntervalSpy.calls.reset();
    });

    it('clears all timers and sends remaining metrics', function() {
      const sent = jasmine.createSpy('sent');
      attachHook(sent);
      const scopedMetric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000,
        summaryInterval: 1000,
        enabled: true
      });

      expect(setIntervalSpy).toHaveBeenCalledTimes(2);

      scopedMetric.put(1, 'metricName', [{ Name:'ExtraDimension', Value: 'Value'}]);
      scopedMetric.summaryPut(10, 'summaryMetric', [{ Name: 'ExtraDimension', Value: 'Value'}]);

      expect(sent).not.toHaveBeenCalled();

      scopedMetric.shutdown();

      expect(sent).toHaveBeenCalledTimes(2);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });
  });
});
