/**
 * Copyright 2018 Pisamad. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */
import Q from 'bluebird'
import _ from 'lodash'
import { spawn, spawnSync } from 'child_process'
import stream from 'stream'

import { shlex, convertOut, writeMarshal, createErrorType } from './helpers'

// Allow promise cancellation
Q.config({
  cancellation: true
})

export const P4apiTimeoutError = createErrorType('P4apiTimeoutError', function (timeout) {
  this.timeout = timeout
  this.message = 'Timeout ' + timeout + 'ms reached.'
})

export const P4apiError = createErrorType('P4apiError', function (message) {
  this.message = message
})

class SimpleStream extends stream {
  constructor (arg) {
    super()
    this.arg = arg
  }

  write (s) {
    this.arg.input = Buffer.concat([this.arg.input, Buffer.from(s)])
  }

  end () {
  }
}

export class P4 {
  constructor (p4set = {}, debug = false) {
    this.debug = debug
    this.cwd = process.cwd()
    this.options = {
      env: {
        PWD: this.cwd
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.cwd
    }
    _.assign(this.options.env, process.env, p4set)
    this._setGlobalOptions()
  }

  /**
   * Set options for the exec context.
   * Supports all optinos supported by child_process.exec.
   * Supports chaining.
   *
   * @param {object} opts - The options object
   * @returns {object} this
   */
  setOpts (opts) {
    Object.keys(opts).forEach(key => {
      if (!(key === 'cwd')) {
        this.options[key] = opts[key]
        this._setGlobalOptions()
      }
    })
  }

  addOpts (opts) {
    Object.keys(opts).forEach(key => {
      if (!(key === 'cwd')) {
        this.options[key] = _.extend(this.options[key] || {}, opts[key])
        this._setGlobalOptions()
      }
    })
  }

  _setGlobalOptions () {
    this.globalOptions = []
    // Force P4 env overriding env comming from P4CONFIG
    if (this.options.env.P4CLIENT) {
      this.globalOptions = this.globalOptions.concat(['-c', this.options.env.P4CLIENT])
    }
    if (this.options.env.P4PORT) {
      this.globalOptions = this.globalOptions.concat(['-p', this.options.env.P4PORT])
    }
    if (this.options.env.P4USER) {
      this.globalOptions = this.globalOptions.concat(['-u', this.options.env.P4USER])
    }
  }

  static _formatResult (command, dataOut, dataErr) {
    // Format the result  like an object :
    // {'stat':[{},{},...], 'error':[{},{},...],
    //  'value':{'code':'text' or 'binary', 'data':'...'},
    // 'prompt':'...'}
    const result = {}
    const dataOutLength = dataOut.length

    for (let i = 0, len = dataOutLength; i < len; i++) {
      const key = dataOut[i].code

      if ((key === 'text') || (key === 'binary')) {
        result.data = result.data || ''
        result.data += dataOut[i].data
      } else if (key === 'prompt') {
        result[key] = dataOut[i].prompt
      } else {
        result[key] = result[key] || []
        result[key].push(dataOut[i])
      }
    }
    // Is there stderr ==> error
    if (dataErr.length > 0) {
      result.error = result.error || []
      result.error.push({ code: 'error', data: dataErr.toString(), severity: 3, generic: 4 })
    }

    // Special case for 'set' command
    if (command === 'set') {
      // Result is like : "rompt: "P4CHARSET=utf8 (set)\nP4CONFIG=.p4config (set) (config 'noconfig')\nP4EDITOR=C:..."
      const p4Set = result.prompt.match(/P4.*=[^\s]*/g) || []
      const p4SetLength = p4Set.length

      result.stat = [{}]
      for (let i = 0; i < p4SetLength; i++) {
        const set = p4Set[i].match(/([^=]*)=(.*)/)

        result.stat[0][set[1]] = set[2]
      }
    }
    return result
  }

  _execCmd (p4Cmd, reject, onCancel) {
    const result = {
      timeout: {
        handle: null,
        fired: false
      },
      child: null
    }
    if (this.options.env.P4API_TIMEOUT > 0) {
      result.timeout.handle = setTimeout(function () {
        result.timeout.fired = true
        result.timeout.handle = null
        result.child.kill()
      }, this.options.env.P4API_TIMEOUT)
    }

    result.child = spawn('p4', p4Cmd, this.options)

    onCancel(() => {
      result.child.kill()
    })

    result.child.on('error', () => {
      if (result.timeout.handle !== null) {
        clearTimeout(result.timeout.handle)
        result.timeout.handle = null
      }
      reject(new P4apiError())
    })

    return result
  }

  /**
   * Run a command, used internally but public.
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marshal and to passe to P4 stdin
   */
  cmd (command, dataIn) {
    return new Q((resolve, reject, onCancel) => {
      let dataOut = Buffer.alloc(0)
      let dataErr = Buffer.alloc(0)

      const p4Cmd = ['-G'].concat(this.globalOptions, shlex(command))
      const { timeout, child } = this._execCmd(p4Cmd, reject, onCancel)

      if (dataIn) {
        writeMarshal(dataIn, child.stdin)
      }

      child.stdout.on('data', data => {
        dataOut = Buffer.concat([dataOut, data])
      })

      child.stderr.on('data', data => {
        dataErr = Buffer.concat([dataOut, data])
      })

      child.on('close', () => {
        if (timeout.fired) {
          reject(new P4apiTimeoutError(this.options.env.P4API_TIMEOUT))
          return
        }

        if (timeout.handle !== null) {
          clearTimeout(timeout.handle)
          timeout.handle = null
        }

        dataOut = convertOut(dataOut)
        const result = P4._formatResult(command, dataOut, dataErr)
        if (this.debug) {
          console.log('-P4 ', command, JSON.stringify(result))
        }
        resolve(result)
      })
    })
  }

  /**
   * Synchronously Run a command .
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marshal and to passe to P4 stdin
   */
  cmdSync (command, dataIn) {
    this.options.input = Buffer.alloc(0)
    if (dataIn) {
      writeMarshal(dataIn, new SimpleStream(this.options))
    }

    if (this.options.env.P4API_TIMEOUT > 0) {
      this.options.timeout = this.options.env.P4API_TIMEOUT
    }

    const p4Cmd = ['-G'].concat(this.globalOptions, shlex(command))
    const child = spawnSync('p4', p4Cmd, this.options)
    if (child.error !== undefined) {
      if (child.signal != null) {
        throw new P4apiTimeoutError(this.options.timeout)
      }
      throw new P4apiError(child.error)
    }

    const dataOut = convertOut(child.stdout)
    const dataErr = child.stderr
    const result = P4._formatResult(command, dataOut, dataErr)
    if (this.debug) {
      console.log('-P4 ', command, JSON.stringify(result))
    }
    return result
  };

  /**
   * Run a command.
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marshal and to passe to P4 stdin
   */
  rawCmd (command, dataIn) {
    return new Q((resolve, reject, onCancel) => {
      let dataOut = Buffer.alloc(0)
      let dataErr = Buffer.alloc(0)

      const p4Cmd = [].concat(this.globalOptions, shlex(command))
      let { timeoutHandle, timeoutFired, child } = this._execCmd(p4Cmd, reject, onCancel)

      if (dataIn) {
        child.stdin.write(dataIn)
        child.stdin.end()
      }

      child.stdout.on('data', data => {
        dataOut = Buffer.concat([dataOut, data])
      })

      child.stderr.on('data', data => {
        dataErr = Buffer.concat([dataOut, data])
      })

      child.on('close', () => {
        if (timeoutFired) {
          reject(new P4apiTimeoutError(this.options.env.P4API_TIMEOUT))
          return
        }

        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }

        const result = {
          text: dataOut.toString(),
          error: dataErr.toString()
        }
        // console.log('-P4 ', command, JSON.stringify(result));
        resolve(result)
      })
    }
    )
  }

  /**
   * Synchronously Run a command .
   * @param {string} command - The command to run
   * @param {object} dataIn - object to convert to marshal and to passe to P4 stdin
   */
  rawCmdSync (command, dataIn) {
    this.options.input = Buffer.alloc(0)
    if (dataIn) {
      this.options.input = Buffer.from(dataIn)
    }

    if (this.options.env.P4API_TIMEOUT > 0) {
      this.options.timeout = this.options.env.P4API_TIMEOUT
    }

    const p4Cmd = [].concat(this.globalOptions, shlex(command))
    const child = spawnSync('p4', p4Cmd, this.options)
    if (child.error !== undefined) {
      if (child.signal != null) {
        throw new P4apiTimeoutError(this.options.timeout)
      }
      throw new P4apiError(child.error)
    }

    const dataOut = child.stdout
    const dataErr = child.stderr
    const result = {
      text: dataOut.toString(),
      error: dataErr.toString()
    }
    if (this.debug) {
      console.log('-P4 ', command, JSON.stringify(result))
    }
    return result
  };

  /**
   * Launch a P4VC cmd
   */
  async visual (cmd) {
    let options = []

    if (this.options.env.P4PORT) options = options.concat(['-p', this.options.env.P4PORT])
    if (this.options.env.P4USER) options = options.concat(['-u', this.options.env.P4USER])
    if (this.options.env.P4CLIENT) options = options.concat(['-c', this.options.env.P4CLIENT])

    const visualCmd = options.concat(shlex(cmd))

    return new Q((resolve) => {
      spawn('p4vc', visualCmd).on('close', resolve)
    })
  };
}

P4.prototype.Error = P4apiError
P4.prototype.TimeoutError = P4apiTimeoutError

// Named values for error severities returned by
P4.prototype.SEVERITY = {
  E_EMPTY: 0, // nothing yet
  E_INFO: 1, // something good happened
  E_WARN: 2, // something not good happened
  E_FAILED: 3, // user did something wrong
  E_FATAL: 4 // system broken -- nothing can continue
}

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

}
