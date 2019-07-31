/**
 * A simple tool to track the aggregate of an unordered sequence of values.
 *
 * Produces MIN, MAX, SUM, and COUNT.
 */
class SummarySet {
  constructor({minSentinel = Infinity, maxSentinel = -Infinity} = {}) {
    this._minSentinel = minSentinel;
    this._maxSentinel = maxSentinel;

    this.reset();
  }

  put(value) {
    this._sum += value;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);
    ++this._count;
  }

  get size() {
    return this._count;
  }

  /**
   * Get and reset the summarized statistics.
   *
   * @return {Object<String, Number>} The Minimum, Maximum, Sum, and SampleCount values.
   */
  get() {
    const result = this.peek();
    this.reset();
    return result;
  }

  /**
   * Get the summarized statistics, but do not reset them.
   *
   * @return {Object<String, Number>} The Minimum, Maximum, Sum, and SampleCount values.
   */
  peek() {
    return {
      Minimum: this._min,
      Maximum: this._max,
      Sum: this._sum,
      SampleCount: this._count,
    };
  }

  /**
   * Reset the summarized statistics.
   */
  reset() {
    this._min = this._minSentinel;
    this._max = this._maxSentinel;
    this._sum = 0;
    this._count = 0;
  }
}

module.exports = SummarySet;
