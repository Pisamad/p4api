import _ from 'lodash'
import PyMarshal from 'py-marshal'

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
  return quoteOpen ? [] : out
}

/**
 * Takes output from p4 -G and parses it to an object.
 * @param {string} outString - The output from P4 (String or Buffer)
 * @returns {object} the result
 */
export function convertOut (outString) {
  const buf = Buffer.isBuffer(outString) ? outString : Buffer.from(outString)
  const result = []
  let i = 0
  let prompt = ''
  const bufLength = buf.length

  // Look for the start of a valid answer
  while (i < bufLength) {
    const elt = buf.toString('ascii', i, i + 1)

    if (elt === '{') break
    prompt += elt
    i++
  }
  result.push({ code: 'prompt', prompt: prompt })

  const decoder = new PyMarshal(buf.slice(i))
  while (decoder.moreData) {
    result.push(decoder.read())
  }

  return result
}

/**
 * Takes a object and transform it in marshal format and input into stream to p4 -G
 * @param {object} inObject - The input string or buffer to analyse
 * @param {SimpleStream} inputStream - A writable stream where result will be sent
 * @returns {string} the result
 */
export function writeMarshal (inObject, inputStream) {
  if (typeof inObject === 'string') {
    inputStream.write(Buffer.from(inObject))
  } else {
    inputStream.write(PyMarshal.writeToBuffer(inObject))
  }
  inputStream.end()
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
