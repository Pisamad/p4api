/**
 * @fileoverview
 * This is a module loader and dependency injector.
 * It requires all modules required by P4 and then passes them in.
 * It supports easy mocking and testing.
 */
var p4 = require('./p4').p4;

exports.p4 = p4;
