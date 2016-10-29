module.exports = (function () {
    /*jslint node:true*/
    'use strict';
    /**
     * This is a bootstrapper for dependency
     * injection. It is used so we can require or
     * mock the modules outside of this file and
     * pass them in at runtime. This makes testing
     * MUCH simpler as we can mock objects in
     * tests and pass them in.
     *
     * @returns {object} P4 - The P4 module constructor.
     */
    var Q = require("q");
    var _ = require('lodash');
    var spawn = require('child_process').spawn;
    var spawnSync = require('child_process').spawnSync;

    /**
     * @constructor
     */
    var p4 = {
        cwd: process.cwd(),
        env: process.env,
        options: {env: process.env},
    };

    /**
     * A function for parsing shell-like quoted arguments into an array,
     * similar to Python's shlex.split. Also allows quotes mid-way through a string,
     * and parses them out for you. Returns false on failure (from unbalanced quotes).
     * @param {string} str
     */
    function shlex(str) {
        var args = _.compact(str.split(' '));
        var out = [];
        var lookForClose = -1;
        var quoteOpen = false;
        for (var x in args) {
            if (args.hasOwnProperty(x)) {
                var arg = args[x];
                var escSeq = false;
                var underQuote = false;
                for (var y in arg) {
                    if (escSeq) {
                        escSeq = false;
                    } else if (arg[y] === "\\") {
                        escSeq = true;
                    } else if (arg[y] === "\"") {
                        quoteOpen = !quoteOpen;
                        underQuote = true;
                    }
                }
                if (!quoteOpen && lookForClose === -1) {
                    if (underQuote) arg = arg.slice(1, -1);
                    out.push(arg);
                } else if (quoteOpen && lookForClose === -1) {
                    lookForClose = x;
                } else if (!quoteOpen && lookForClose >= 0) {
                    var block = args.slice(lookForClose, parseInt(x) + 1).join(" ");
                    var escSeq = false;
                    var quotes = [];
                    for (var y in block) {
                        if (escSeq) {
                            escSeq = false;
                        } else if (block[y] === "\\") {
                            escSeq = true;
                        } else if (block[y] === "\"") {
                            quotes.push(y);
                        }
                    }
                    var parts = [];
                    parts.push(block.substr(0, quotes[0]));
                    parts.push(block.substr(parseInt(quotes[0]) + 1, quotes[1] - (parseInt(quotes[0]) + 1)));
                    parts.push(block.substr(parseInt(quotes[1]) + 1));
                    block = parts.join("");
                    out.push(block);
                    lookForClose = -1;
                }
            }
        }
        return quoteOpen ? false : out;
    }

    /**
     * Takes output from p4 -G and parses it to an object.
     * @param {string} outString - The output
     * @returns {object} the result
     */
    function convertOut(outString) {
        var buf = Buffer.isBuffer(outString) ? outString : new Buffer(outString);
        var result = [];
        var index = 0;
        var i = 0;
        var key = '';
        var prompt = '';
        var bufLength = buf.length;
        // Look for the start of a valid answer
        while (i < bufLength) {
            var elt = buf.toString('ascii', i, i + 1);
            if (elt == '{') break;
            prompt += elt;
            i++;
        }
        result[index] = {code: 'prompt', prompt: prompt};

        // Parse answer
        while (i < bufLength) {
            var elt = buf.toString('ascii', i, i + 1);

            switch (elt) {
                case '{':
                    // Start of a new element
                    index++;
                    result[index] = {};
                    i++;
                    key = '';
                    break;
                case 's':
                    // A text
                    i++;
                    var lg = buf.readUInt32LE(i);
                    i += 4;
                    var str = buf.toString('ascii', i, i + lg);
                    i += lg;
                    if (key == '') {
                        // Text is a key
                        key = str;
                    }
                    else {
                        // Text is the value of last key
                        result[index][key] = str;
                        key = '';
                    }
                    break;
                case 'i':
                    // A integer
                    i++;
                    var val = buf.readUInt32LE(i);
                    i += 4;
                    if (key == '') {
                        // Text is a key
                        // !!! Syntax error
                        console.log('Syntax error');
                    }
                    else {
                        // Text is the value of last key
                        result[index][key] = val;
                        key = '';
                    }
                    break;
                case '0':
                    // End of the element
                    i++;
                    break;
                default:
                    // Syntax error, we return the original string
                    console.log('Syntax error or result is a string');
                    return outString;
                    break;
            }
        }
        return result;
    }

    /**
     * Takes a object and transform it in marchal format and input into stream to p4 -G
     * @param {object} inObject - The input
     * @param {stream} stdin stream
     * @returns {string} the result
     */
    function writeMarchal(inObject, stream) {
        if (typeof inObject === 'string') {
            stream.write(inObject);
        } else {

            stream.write('{');
            var keyLen = new Buffer(4);
            var valueLen = new Buffer(4);
            for (var key in inObject) {
                if (inObject.hasOwnProperty(key)) {
                    var value = String(inObject[key]);
                    keyLen.writeUInt32LE(key.length, 0);
                    valueLen.writeUInt32LE(value.length, 0);
                    stream.write('s');
                    stream.write(keyLen);
                    stream.write(key);
                    stream.write('s');
                    stream.write(valueLen);
                    stream.write(value);
                }
            }

            stream.write('0');
        }
        stream.end();
    }


    /**
     * Set options for the exec context.
     * Supports all optinos supported by child_process.exec.
     * Supports chaining.
     *
     * @param {object} opts - The options object
     * @returns {object} this
     */
    p4.setOpts = function (opts) {
        var self = this;
        Object.keys(opts).forEach(function (key) {
            if (key === 'cwd') {
                // Don't allow changing cwd via setOpts...
                return;
            }
            self.options[key] = opts[key];
        });
        return this;
    };

    p4.addOpts = function (opts) {
        var self = this;
        self.options = self.options || {};
        Object.keys(opts).forEach(function (key) {
            if (key === 'cwd') {
                // Don't allow changing cwd via setOpts...
                return;
            }
            self.options[key] = _.extend(self.options[key] || {}, opts[key]);
        });
        return this;
    };

    /**
     * Run a command, used internally but public.
     * @param {string} command - The command to run
     * @param {object} dataIn - object to convert to marchal and to passe to P4 stdin
     */
    p4.cmd = function (command, dataIn) {
        console.log('--> p4 ' + command);
        var deferred = Q.defer();

        var self = this;
        var dataOut = new Buffer(0);
        var dataErr = new Buffer(0);
        var globalOptions = ['-G'];

        this.options.cwd = this.cwd;
        this.options.env = this.options.env || {};
        this.options.env.PWD = this.cwd;
        this.options.stdio = ['pipe', 'pipe', 'pipe'];

        // Force P4 env overriding env comming from P4CONFIG
        if (this.options.env.P4CLIENT) {globalOptions = globalOptions.concat(['-c', this.options.env.P4CLIENT])}
        if (this.options.env.P4PORT) {globalOptions = globalOptions.concat(['-p', this.options.env.P4PORT])}
        if (this.options.env.P4USER) {globalOptions = globalOptions.concat(['-u', this.options.env.P4USER])}

        var p4Cmd = globalOptions.concat(shlex(command));
        try {
            var child = spawn('p4', p4Cmd, this.options);

            child.on('error', function(err){
                deferred.reject(err);
            });

            if (dataIn) {
                writeMarchal(dataIn, child.stdin)
            }

            child.stdout.on('data', function (data) {
                dataOut = Buffer.concat([dataOut, data]);
            });

            child.stderr.on('data', function (data) {
                dataErr = Buffer.concat([dataOut, data]);
            });

            child.on('close', function () {
                dataOut = convertOut(dataOut);
                // Format the result  like an object : 
                // {'stat':[{},{},...], 'error':[{},{},...], 
                //  'value':{'code':'text' or 'binary', 'data':'...'},
                // 'prompt':'...'}
                var result = {};
                var dataOutLength = dataOut.length;
                for (var i = 0, len = dataOutLength; i < len; i++) {
                    var key = dataOut[i].code;
                    if ((key == 'text') || (key == 'binary')) {
                        result.data = result.data || '';
                        result.data += dataOut[i].data;
                    } else if (key == 'prompt') {
                        result[key] = dataOut[i].prompt;
                    } else {
                        result[key] = result[key] || [];
                        result[key].push(dataOut[i]);
                    }
                }
                // Is there stderr ==> error
                if (dataErr.length > 0) {
                    result.error = result.error || [];
                    result.error.push({code: 'error', data: dataErr.toString(), severity: 3, generic: 4});
                }


                // Special case for 'set' command
                if (command === 'set') {
                    // Result is like : "rompt: "P4CHARSET=utf8 (set)\nP4CONFIG=.p4config (set) (config 'noconfig')\nP4EDITOR=C:..."
                    var p4Set = result.prompt.match(/P4.*=[^\s]*/g) || [];
                    var p4SetLength = p4Set.length;
                    result.stat = [{}];
                    for (var i = 0; i < p4SetLength; i++) {
                        var set = p4Set[i].match(/([^=]*)=(.*)/);
                        result.stat[0][set[1]] = set[2];
                    }
                }

                deferred.resolve(result);
            });

        } catch (e) {
            deferred.reject(new Error('Err : ' + e));
        }

        return deferred.promise;
    };

    /**
     * Synchronously Run a command .
     * @param {string} command - The command to run
     * @param {object} dataIn - object to convert to marchal and to passe to P4 stdin
     */
    p4.cmdSync = function (command, dataIn) {
        console.log('--> sync p4 ' + command);

        var self = this;
        var dataOut = new Buffer(0);
        var dataErr = new Buffer(0);
        var globalOptions = ['-G'];

        this.options.cwd = this.cwd;
        this.options.env = this.options.env || {};
        this.options.env.PWD = this.cwd;
        this.options.stdio = ['pipe', 'pipe', 'pipe'];

        if (dataIn) {
            writeMarchal(dataIn, this.options.input)
        }
        
        // Force P4 env overriding env comming from P4CONFIG
        if (this.options.env.P4CLIENT) {globalOptions = globalOptions.concat(['-c', this.options.env.P4CLIENT])}
        if (this.options.env.P4PORT) {globalOptions = globalOptions.concat(['-p', this.options.env.P4PORT])}
        if (this.options.env.P4USER) {globalOptions = globalOptions.concat(['-u', this.options.env.P4USER])}

        var p4Cmd = globalOptions.concat(shlex(command));
        try {
            var child = spawnSync('p4', p4Cmd, this.options);

            dataOut = convertOut(child.stdout);
            dataErr = child.stderr;
            
            // Format the result  like an object : 
            // {'stat':[{},{},...], 'error':[{},{},...], 
            //  'value':{'code':'text' or 'binary', 'data':'...'},
            // 'prompt':'...'}
            var result = {};
            var dataOutLength = dataOut.length;
            for (var i = 0, len = dataOutLength; i < len; i++) {
                var key = dataOut[i].code;
                if ((key == 'text') || (key == 'binary')) {
                    result.data = result.data || '';
                    result.data += dataOut[i].data;
                } else if (key == 'prompt') {
                    result[key] = dataOut[i].prompt;
                } else {
                    result[key] = result[key] || [];
                    result[key].push(dataOut[i]);
                }
            }
            // Is there stderr ==> error
            if (dataErr.length > 0) {
                result.error = result.error || [];
                result.error.push({code: 'error', data: dataErr.toString(), severity: 3, generic: 4});
            }


            // Special case for 'set' command
            if (command === 'set') {
                // Result is like : "rompt: "P4CHARSET=utf8 (set)\nP4CONFIG=.p4config (set) (config 'noconfig')\nP4EDITOR=C:..."
                var p4Set = result.prompt.match(/P4.*=[^\s]*/g) || [];
                var p4SetLength = p4Set.length;
                result.stat = [{}];
                for (var i = 0; i < p4SetLength; i++) {
                    var set = p4Set[i].match(/([^=]*)=(.*)/);
                    result.stat[0][set[1]] = set[2];
                }
            }

            return result;

        } catch (e) {
            throw(new Error('Err : ' + e));
        }
    };

    /**
     * Launch a P4VC cmd
     */
    p4.visual = function (cmd) {

        var options = [];
        if (this.options.env.P4PORT) options = options.concat(['-p', this.options.env.P4PORT]);
        if (this.options.env.P4USER) options = options.concat(['-u', this.options.env.P4USER]);
        if (this.options.env.P4CLIENT) options = options.concat(['-c', this.options.env.P4CLIENT]);

        var deferred = Q.defer();
        var visualCmd = options.concat(shlex(cmd));
        try {
            var child = spawn('p4vc', visualCmd);

            child.on('close', function () {
                deferred.resolve();
            });

        } catch (e) {
            deferred.reject(new Error('Err : ' + e));
        }

        return deferred.promise;

    };

    return p4;

})();

