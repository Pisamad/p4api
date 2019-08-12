import _ from 'lodash'

/**
 * A function for parsing shell-like quoted arguments into an array,
 * similar to Python's shlex.split. Also allows quotes mid-way through a string,
 * and parses them out for you. Returns false on failure (from unbalanced quotes).
 * @param {string} str
 */
export function shlex (str) {
  const args = _.compact(str.split(' '))
  const out = []
  let lookForClose = -1
  let quoteOpen = false

  for (const x in args) {
    let arg = args[x]
    let escSeq = false
    let underQuote = false

    for (const y in arg) {
      if (escSeq) {
        escSeq = false
      } else if (arg[y] === '\\') {
        escSeq = true
      } else if (arg[y] === '"') {
        quoteOpen = !quoteOpen
        underQuote = true
      }
    }
    if (!quoteOpen && lookForClose === -1) {
      if (underQuote) arg = arg.slice(1, -1)
      out.push(arg)
    } else if (quoteOpen && lookForClose === -1) {
      lookForClose = x
    } else if (!quoteOpen && lookForClose >= 0) {
      let block = args.slice(lookForClose, parseInt(x) + 1).join(' ')

      let escSeq = false

      const quotes = []

      for (const y in block) {
        if (escSeq) {
          escSeq = false
        } else if (block[y] === '\\') {
          escSeq = true
        } else if (block[y] === '"') {
          quotes.push(y)
        }
      }
      const parts = []

      parts.push(block.substr(0, quotes[0]))
      parts.push(block.substr(parseInt(quotes[0]) + 1, quotes[1] - (parseInt(quotes[0]) + 1)))
      parts.push(block.substr(parseInt(quotes[1]) + 1))
      block = parts.join('')
      out.push(block)
      lookForClose = -1
    }
  }
  return quoteOpen ? false : out
}

/**
 * Takes output from p4 -G and parses it to an object.
 * @param {string} outString - The output from P4 (String or Buffer)
 * @returns {object} the result
 */
export function convertOut (outString) {
  const buf = Buffer.isBuffer(outString) ? outString : Buffer.from(outString)
  const result = []
  let index = 0
  let i = 0
  let key = ''
  let prompt = ''
  const bufLength = buf.length

  // Look for the start of a valid answer
  while (i < bufLength) {
    const elt = buf.toString('ascii', i, i + 1)

    if (elt === '{') break
    prompt += elt
    i++
  }
  result[index] = { code: 'prompt', prompt: prompt }

  // Parse answer
  while (i < bufLength) {
    const elt = buf.toString('ascii', i, i + 1)

    switch (elt) {
      case '{':
        // Start of a new element
        index++
        result[index] = {}
        i++
        key = ''
        break
      case 's':
        // A text
        i++
        const lg = buf.readUInt32LE(i)

        i += 4
        const str = buf.toString('ascii', i, i + lg)

        i += lg
        if (key === '') {
          // Text is a key
          key = str
        } else {
          // Text is the value of last key
          result[index][key] = str
          key = ''
        }
        break
      case 'i':
        // A integer
        i++
        const val = buf.readUInt32LE(i)

        i += 4
        if (key === '') {
          // Text is a key
          // !!! Syntax error
          console.error('Syntax error')
        } else {
          // Text is the value of last key
          result[index][key] = val
          key = ''
        }
        break
      case '0':
        // End of the element
        i++
        break
      default:
        // Syntax error, we return the original string
        console.error('Syntax error or result is a string')
        return outString
    }
  }
  return result
}

/**
 * Takes a object and transform it in marchal format and input into stream to p4 -G
 * @param {object} inObject - The input string or buffer to analyse
 * @param {stream} stream - A writable stream where result will be sent
 * @returns {string} the result
 */
export function writeMarchal (inObject, stream) {
  if (typeof inObject === 'string') {
    stream.write(Buffer.from(inObject))
  } else {
    stream.write(Buffer.from('{'))

    for (const key in inObject) {
      const value = String(inObject[key])
      const keyLen = Buffer.alloc(4)
      const valueLen = Buffer.alloc(4)

      keyLen.writeUInt32LE(key.length, 0)
      valueLen.writeUInt32LE(value.length, 0)
      stream.write(Buffer.from('s'))
      stream.write(keyLen)
      stream.write(Buffer.from(key))
      stream.write(Buffer.from('s'))
      stream.write(valueLen)
      stream.write(Buffer.from(value))
      // console.log(keyLen, key.length, key, valueLen, value.length, value);
    }

    stream.write(Buffer.from('0'))
  }
  stream.end()
}

/**
 * Create a Error handler
 * @param name (String) Error Name
 * @param init (Function) Error handle
 * @returns {E}
 *
 * Example :
 * var NameError = createErrorType('NameError', function (name, invalidChar) {
 *  this.message = 'The name ' + name + ' may not contain ' + invalidChar;
 * });
 *
 * var UnboundError = createErrorType('UnboundError', function (variableName) {
 *  this.message = 'Variable ' + variableName + ' is not bound';
 * });
 *
 * Ref : https://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript
 */
export function createErrorType (name, init) {
  function E (message) {
    if (!Error.captureStackTrace) {
      this.stack = (new Error()).stack
    } else {
      Error.captureStackTrace(this, this.constructor)
    }
    this.message = message
    init && init.apply(this, arguments)
  }

  E.prototype = new Error()
  E.prototype.name = name
  E.prototype.constructor = E
  return E
}
