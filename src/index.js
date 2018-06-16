import Q from 'bluebird';
import _ from 'lodash';
import {spawn, spawnSync} from 'child_process';

import {shlex, convertOut, writeMarchal} from './helpers';

export class P4 {
  constructor(p4set = {}) {
    this.cwd = process.cwd();
    this.options = {env: {}};
    _.assign(this.options.env, process.env, p4set);
  }

  /**
   * Set options for the exec context.
   * Supports all optinos supported by child_process.exec.
   * Supports chaining.
   *
   * @param {object} opts - The options object
   * @returns {object} this
   */
  setOpts(opts) {
    Object.keys(opts).forEach(key => {
      if (key === 'cwd') {
        // Don't allow changing cwd via setOpts...
        return;
      }
      this.options[key] = opts[key];
    });
  }

  addOpts(opts) {
    this.options = this.options || {};
    Object.keys(opts).forEach(key => {
      if (key === 'cwd') {
        // Don't allow changing cwd via setOpts...
        return;
      }
      this.options[key] = _.extend(this.options[key] || {}, opts[key]);
    });
  }

  /**
   * Run a command, used internally but public.
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marchal and to passe to P4 stdin
   */
  async cmd(command, dataIn) {
    return await new Q((resolve, reject) => {
      let dataOut = Buffer.alloc(0);
      let dataErr = Buffer.alloc(0);
      let globalOptions = ['-G'];

      this.options.cwd = this.cwd;
      this.options.env = this.options.env || {};
      this.options.env.PWD = this.cwd;
      this.options.stdio = ['pipe', 'pipe', 'pipe'];

      // Force P4 env overriding env comming from P4CONFIG
      if (this.options.env.P4CLIENT) {
        globalOptions = globalOptions.concat(['-c', this.options.env.P4CLIENT]);
      }
      if (this.options.env.P4PORT) {
        globalOptions = globalOptions.concat(['-p', this.options.env.P4PORT]);
      }
      if (this.options.env.P4USER) {
        globalOptions = globalOptions.concat(['-u', this.options.env.P4USER]);
      }

      let p4Cmd = globalOptions.concat(shlex(command));
      let result = {};

      try {
        let child = spawn('p4', p4Cmd, this.options);

        child.on('error', err => {
          reject(err);
        });

        if (dataIn) {
          writeMarchal(dataIn, child.stdin);
        }

        child.stdout.on('data', data => {
          dataOut = Buffer.concat([dataOut, data]);
        });

        child.stderr.on('data', data => {
          dataErr = Buffer.concat([dataOut, data]);
        });

        child.on('close', () => {
          dataOut = convertOut(dataOut);
          // Format the result  like an object :
          // {'stat':[{},{},...], 'error':[{},{},...],
          //  'value':{'code':'text' or 'binary', 'data':'...'},
          // 'prompt':'...'}
          let dataOutLength = dataOut.length;

          for (let i = 0, len = dataOutLength; i < len; i++) {
            let key = dataOut[i].code;

            if ((key === 'text') || (key === 'binary')) {
              result.data = result.data || '';
              result.data += dataOut[i].data;
            } else if (key === 'prompt') {
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
            let p4Set = result.prompt.match(/P4.*=[^\s]*/g) || [];
            let p4SetLength = p4Set.length;

            result.stat = [{}];
            for (let i = 0; i < p4SetLength; i++) {
              let set = p4Set[i].match(/([^=]*)=(.*)/);

              result.stat[0][set[1]] = set[2];
            }
          }

          resolve(result);
        });
      } catch (e) {
        reject(new Error(e));
      } finally {
      }
    },
    );
  }

  /**
   * Synchronously Run a command .
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marchal and to passe to P4 stdin
   */
  cmdSync(command, dataIn) {
    let dataOut = Buffer.alloc(0);
    let dataErr = Buffer.alloc(0);
    let globalOptions = ['-G'];

    this.options.cwd = this.cwd;
    this.options.env = this.options.env || {};
    this.options.env.PWD = this.cwd;
    this.options.stdio = ['pipe', 'pipe', 'pipe'];
    this.options.input = '';

    if (dataIn) {
      writeMarchal(dataIn, {
        write: s => {
          this.options.input += s;
        },
        end: () => {
        }
      },
      );
    }

    // Force P4 env overriding env comming from P4CONFIG
    if (this.options.env.P4CLIENT) {
      globalOptions = globalOptions.concat(['-c', this.options.env.P4CLIENT]);
    }
    if (this.options.env.P4PORT) {
      globalOptions = globalOptions.concat(['-p', this.options.env.P4PORT]);
    }
    if (this.options.env.P4USER) {
      globalOptions = globalOptions.concat(['-u', this.options.env.P4USER]);
    }

    let p4Cmd = globalOptions.concat(shlex(command));

    try {
      let child = spawnSync('p4', p4Cmd, this.options);

      dataOut = convertOut(child.stdout);
      dataErr = child.stderr;

      // Format the result  like an object :
      // {'stat':[{},{},...], 'error':[{},{},...],
      //  'value':{'code':'text' or 'binary', 'data':'...'},
      // 'prompt':'...'}
      let result = {};
      let dataOutLength = dataOut.length;

      for (let i = 0, len = dataOutLength; i < len; i++) {
        let key = dataOut[i].code;

        if ((key === 'text') || (key === 'binary')) {
          result.data = result.data || '';
          result.data += dataOut[i].data;
        } else if (key === 'prompt') {
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
        let p4Set = result.prompt.match(/P4.*=[^\s]*/g) || [];
        let p4SetLength = p4Set.length;

        result.stat = [{}];
        for (let i = 0; i < p4SetLength; i++) {
          let set = p4Set[i].match(/([^=]*)=(.*)/);

          result.stat[0][set[1]] = set[2];
        }
      }

      return result;

    } catch (e) {
      throw new Error(e);
    }
  };

  /**
   * Launch a P4VC cmd
   */
  async visual(cmd) {
    let options = [];

    if (this.options.env.P4PORT) options = options.concat(['-p', this.options.env.P4PORT]);
    if (this.options.env.P4USER) options = options.concat(['-u', this.options.env.P4USER]);
    if (this.options.env.P4CLIENT) options = options.concat(['-c', this.options.env.P4CLIENT]);

    let visualCmd = options.concat(shlex(cmd));

    return await new Q((resolve, reject) => {
      try {
        spawn('p4vc', visualCmd).on('close', resolve);
      } catch (e) {
        reject(new Error(e));
      }
    });
  };

}

// Named values for error severities returned by
P4.prototype.SEVERITY = {
  E_EMPTY: 0, // nothing yet
  E_INFO: 1, // something good happened
  E_WARN: 2, // something not good happened
  E_FAILED: 3, // user did something wrong
  E_FATAL: 4 // system broken -- nothing can continue
};

// Named values for generic error codes returned by
P4.prototype.GENERIC = {
  EV_NONE: 0, // misc

  // The fault of the user
  EV_USAGE: 0x01, // request not consistent with dox
  EV_UNKNOWN: 0x02, // using unknown entity
  EV_CONTEXT: 0x03, // using entity in wrong context
  EV_ILLEGAL: 0x04, // trying to do something you can't
  EV_NOTYET: 0x05, // something must be corrected first
  EV_PROTECT: 0x06, // protections prevented operation

  // No fault at all
  EV_EMPTY: 0x11, // action returned empty results

  // not the fault of the user
  EV_FAULT: 0x21, // inexplicable program fault
  EV_CLIENT: 0x22, // client side program errors
  EV_ADMIN: 0x23, // server administrative action required
  EV_CONFIG: 0x24, // client configuration inadequate
  EV_UPGRADE: 0x25, // client or server too old to interact
  EV_COMM: 0x26, // communications error
  EV_TOOBIG: 0x27 // not even Perforce can handle this much

};

