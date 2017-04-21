## cloudwatch-metrics
This module provides a simplified wrapper for creating and publishing
CloudWatch metrics.

## Install
```
$ yarn add cloudwatch-metrics
```
or
```
$ npm install cloudwatch-metrics --save
```

## Usage

### Initialization

By default, the library will log metrics to the `us-east-1` region and read
AWS credentials from the AWS SDK's [default environment variables](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Credentials_from_Environment_Variables).

If you want to change these values, you can call `initialize`:

```js
var cloudwatchMetrics = require('cloudwatch-metrics');
cloudwatchMetrics.initialize({
	region: 'us-east-1'
});
```

### Metric creation
For creating a metric, we simply need to provide the
namespace and the type of metric:
```js
var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count');
```

### Metric creation - w/ default dimensions
If we want to add our own default dimensions, such as environment information,
we can add it in the following manner:
```js
var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
	Name: 'environment',
	Value: 'PROD'
}]);
```

### Metric creation - w/ options
If we want to disable a metric in certain environments (such as local development),
we can make the metric in the following manner:
```js
// isLocal is a boolean
var isLocal = someWayOfDetermingIfLocal();

var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
	Name: 'environment',
	Value: 'PROD'
}], {
	enabled: isLocal
});
```

The full list of configuration options is:

Option | Purpose
------ | -------
enabled | Whether or not we should send the metric to CloudWatch (useful for dev vs prod environments).
sendInterval | The interval in milliseconds at which we send any buffered metrics, defaults to 5000 milliseconds.
sendCallback | A callback to be called when we send metric data to CloudWatch (useful for logging any errors in sending data).
maxCapacity | A maximum number of events to buffer before we send immediately (before the sendInterval is reached).

### Publishing metric data
Then, whenever we want to publish a metric, we simply do:
```js
myMetric.put(value, metric, additionalDimensions);
```

### NOTES
Be aware that the `put` call does not actually send the metric to CloudWatch
at that moment. Instead, it stores unsent metrics and sends them to
CloudWatch on a predetermined interval (to help get around sending too many
metrics at once - CloudWatch limits you by default to 150 put-metric data
calls per second). The default interval is 5 seconds, if you want metrics
sent at a different interval, then provide that option when constructing your
CloudWatch Metric:

```js
var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
	Name: 'environment',
	Value: 'PROD'
}], {
	sendInterval: 3 * 1000 // It's specified in milliseconds.
});
```

You can also register a callback to be called when we actually send metrics
to CloudWatch - this can be useful for logging put-metric-data errors:
```js
var myMetric = new cloudwatchMetrics.Metric('namespace', 'Count', [{
	Name: 'environment',
	Value: 'PROD'
}], {
	sendCallback: (err) => {
		if (!err) return;
		// Do your error handling here.
	}
});
```

## Release History
  1.1.0 Add `metric.sample()`
  1.0.0 Initial release.
