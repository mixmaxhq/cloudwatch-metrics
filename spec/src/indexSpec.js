/* globals describe, afterEach, it, expect, spyOn, jasmine */

const _ = require('underscore');

const rewire = require('rewire');
const cloudwatchMetric = rewire('../..');

describe('cloudwatch-metrics', () => {
  let restoreAWS;

  function attachHook(hook) {
    restoreAWS = cloudwatchMetric.__set__('CloudWatch', function() {
      this.putMetricData = hook;
    });
  }

  function generateMetricData(amount) {
    const metricData = [];

    for (let i = 1; i <= amount; i++) {
      metricData.push({
        Dimensions: [{
          Name: 'environment',
          Value: 'PROD'
        }, {
          Name: 'ExtraDimension',
          Value: 'Value'
        }],
        MetricName: 'metricName',
        Unit: 'Count',
        Value: i
      });
    }

    return metricData;
  }

  function putMetric(metric, amount) {
    for (let i = 1; i <= amount; i++) {
      metric.put(i, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
    }
  }

  afterEach(() => {
    if (restoreAWS) {
      restoreAWS();
      restoreAWS = null;
    }
  });

  describe('options', () => {
    describe('maxCapacity', () => {
      it('should set maxCapacity to specified amount', (done) => {
        attachHook((data, cb) => {
          expect(data).toEqual({
            MetricData: generateMetricData(5),
            Namespace: 'namespace'
          });
          cb();
        });

        const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
          Name: 'environment',
          Value: 'PROD'
        }], {
          sendInterval: 3000,
          sendCallback: done,
          maxCapacity: 5
        });

        expect(metric.options.maxCapacity).toEqual(5);

        putMetric(metric, 5);
      });

      it('should not be possible to specify maxCapacity > 20', (done) => {
        attachHook((data, cb) => {
          expect(data).toEqual({
            MetricData: generateMetricData(20),
            Namespace: 'namespace'
          });
          cb();
        });

        const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
          Name: 'environment',
          Value: 'PROD'
        }], {
          sendInterval: 3000,
          sendCallback: done,
          maxCapacity: 100
        });

        expect(metric.options.maxCapacity).toEqual(20);

        putMetric(metric, 20);
      });
    });
  });

  describe('put', () => {
    it('should buffer until timeout', (done) => {
      attachHook((data, cb) => {
        expect(data).toEqual({
          MetricData: generateMetricData(1),
          Namespace: 'namespace'
        });
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000,
        sendCallback: done
      });

      putMetric(metric, 1);
    });

    it('should call continually', (done) => {
      attachHook((data, cb) => {
        expect(data).toEqual({
          MetricData: generateMetricData(1),
          Namespace: 'namespace'
        });
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 500,
        sendCallback: _.after(3, done)
      });

      let interval;
      const stop = _.after(3, () => clearInterval(interval));
      interval = setInterval(() => {
        putMetric(metric, 1);
        stop();
      }, 400);
    });

    it('should buffer until the cap is hit', (done) => {
      attachHook((data, cb) => {
        expect(data).toEqual({
          MetricData: generateMetricData(2),
          Namespace: 'namespace'
        });
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 3000, // mocha defaults to a 2 second timeout so setting
        // larger than that will cause the test to fail if we
        // hit the timeout
        sendCallback: done,
        maxCapacity: 2
      });

      putMetric(metric, 2);
    });

    it('should set a Timestamp if specified in the options', function(done) {
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
            Unit: 'Count',
            Timestamp: jasmine.any(String),
            Value: 1
          }],
          Namespace: 'namespace'
        });
        expect(Date.parse(data.MetricData[0].Timestamp)).toBeLessThanOrEqual(Date.now());
        cb();
      });

      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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
            Unit: 'Count',
            StorageResolution: 1,
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
        storageResolution: 1,
        sendInterval: 1000, // mocha defaults to a 2 second timeout so setting
        // larger than that will cause the test to fail if we
        // hit the timeout
        sendCallback: done,
      });

      metric.put(1, 'metricName', [{Name: 'ExtraDimension', Value: 'Value'}]);
    });
  });

  describe('sample', () => {
    it('should ignore metrics when not in the sample range', () => {
      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      spyOn(Math, 'random').and.returnValue(0.5);
      spyOn(metric, 'put');

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).not.toHaveBeenCalled();
    });

    it('should call put when the we decide to sample a metric', () => {
      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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

  describe('summaryPut', () => {
    it('should not call with no data', (done) => {
      attachHook(() => {
        throw new Error('should not get send callback');
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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

    it('should call with summary', (done) => {
      let hookCalls = 0;
      attachHook((data, cb) => {
        ++hookCalls;
        expect(data).toEqual({
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
        });
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD',
      }], {
        summaryInterval: 100,
        sendCallback() {
          expect(hookCalls).toBe(1);
          done();
        },
      });

      metric.summaryPut(12, 'some-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
      metric.summaryPut(2, 'some-other-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
      setTimeout(() => {
        metric.summaryPut(13, 'some-metric', [{Name: 'ExtraDimension', Value: 'Value'}]);
      }, 50);
    });

    it('should call after no data', (done) => {
      let hookCalls = 0;
      attachHook((data, cb) => {
        ++hookCalls;
        expect(data).toEqual({
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
        });
        cb();
      });

      const metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
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
});
