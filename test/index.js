var expect = require('chai').expect;
var AWS = require('aws-sdk-mock');
var _ = require('underscore');

var cloudwatchMetric = require('..');

var attachHook = (hook) => AWS.mock('CloudWatch', 'putMetricData', hook);

describe('cloudwatch-metrics', function() {
  afterEach(function() {
    AWS.restore('CloudWatch', 'putMetricData');
  });

  it('should buffer until timeout', function(done) {
    this.timeout(5000);
    attachHook(function(data, cb) {
      expect(data).to.deep.equal({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
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
    this.timeout(3000);
    attachHook(function(data, cb) {
      expect(data).to.deep.equal({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
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
      expect(data).to.deep.equal({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 1
        }, {
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
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
