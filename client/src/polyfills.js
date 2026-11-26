// Polyfill for engines without global Iterator (e.g. for libraries like pdfjs-dist)
if (typeof globalThis.Iterator === 'undefined') {
  globalThis.Iterator = function () {};
  globalThis.Iterator.prototype = Object.getPrototypeOf(
    Object.getPrototypeOf([][Symbol.iterator]())
  );
}

if (typeof globalThis.Iterator.prototype.join !== 'function') {
  globalThis.Iterator.prototype.join = function (separator) {
    return [...this].join(separator);
  };
}
