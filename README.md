## cloudwatch-metrics
This module provides a simplified wrapper for creating and publishing
CloudWatch metrics.

## Install
```
$ npm install cloudwatch-metrics --save
```

## Usage

### Initialization
We should always initialize our environment first:
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

### Publishing metric data
Then, whenever we want to publish a metric, we simply do:
```js
myMetric.put(value, metric, additionalDimensions, done);
```

## Release History
 0.0.1 Initial release.
