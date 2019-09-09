# p4api
With p4api, you will be able to execute Perforce commands in 4 mode in your choice:

|                    | Async command  | Sync comman |
|:--------------:    |:-------------  |:------------|
| **Marshal syntax** | ```cmd()```    | ```cmdSync()```   |
| **Raw syntax**     | ```rawCmd()``` | ```rawCmdSync()```|

Asynchronous command returns a  promise wich will be resolved with the Perforce result 
while sync command is blocked until Perforce has returned a result. 

Promise returned with Sync command can be canceled with ```cancel()``` method, killing launched p4 process.

Marshal syntax consists to use global -G option allowing to provide input and receive result as a JS object.<br/>
Raw syntax uses basic text format.<br/>
*Note that only login command accepts input parameter (password) as a string in both Marshal and Raw modes.*  

If P4VC is installed, you will be able to launch any p4vc command with ```visual()``` method 
wich returns a promise wich is resolved when p4vc has closed.

All these method belong to class P4 provided by the module p4api: [See detail here](#p4-object) 



---
- [Installation](#installation)
- [Development](#development)
- [P4 object](#p4-object)
  * [Contructor](#contructor)
  * [Attributs](#attributs)
  * [Methods](#methods)
    + [Change environment variables](#change-environment-variables)
    + [Marshal syntax commands](#marshal-syntax-commands)
    + [Row syntax commands](#row-syntax-commands)
  * [Error handling](#error-handling)
    + [Cancellation feature](#cancellation-feature--)
- [Examples](#examples)
  * [List of depots](#list-of-depots)
  * [Command Error](#command-error)
  * [Login (command with prompt and input)](#login--command-with-prompt-and-input-)
  * [Check Login (command with param)](#check-login--command-with-param-)
  * [Clear viewpathes of the current Client](#clear-viewpathes-of-the-current-client)
  * [Cancellation](#cancellation)
---
## Installation
Get the module from NPM
``` bash
$ npm install p4api --save
```

## Development
Use build action (npm or yarn) to build lib/p4api.js.

To test it, you need to have installed "Helix Core Apps" and "Helix Versioning Engine" (p4 & p4d). 

## P4 object
### Contructor
``` javascript
import {P4} from "p4api"
const p4 = new P4(option)
```
or
``` javascript
const P4 = require("p4api").P4
const p4 = new P4(option)
```
where option is a set of P4 variables to apply as context when executing p4 commands:
- all P4 environnment variables like P4PORT, P4CHARSET, P4USER, P4CLIENT, ...
- p4api specific option like:
  * P4API_TIMEOUT: timeout in ms for p4 commands process
 
Example:
``` javascript
const p4 = new P4({
    P4PORT: "myP4Server:1666",
    P4CHARSET: "utf8",
    P4API_TIMEOUT: 5000
})
```

> :warning: **WARNING**: <br/>
> P4CLIENT, P4PORt & P4USER will never be overloaded with variable set in a P4CONFIG file


### Attributs
There is no public attribut.
### Methods
#### Change environment variables
`setOpts(opt)` and `addOpts(opt)` allow you to set or merge environment variables.
``` javascript
import {P4} from "p4api"
const p4 = new P4({P4PORT: "p4server:1666"})

p4.setOpts({env:{P4PORT: "newServer:1666"}})
p4.addOpts({env:{P4USER: "bob", P4CLIENT="bob_client"}}
``` 
Where:
- `opt` is the option parameter injected in `spawn()` function
> :warning: **WARNING**: <br/>
> In the most current case, use only the field `env` in `opt`.<br/>
> Use other fields than `env` is not tested !


#### Marshal syntax commands
```cmd(p4Cmd, [input])``` and ```cmdSync(p4Cmd, [input])``` allow to execute any p4 command using Marshal syntax (global p4 option -G).
``` javascript
import {P4} from "p4api"
const p4 = new P4({P4PORT: "p4server:1666"})

// Asynchro mode
p4.cmd(p4Cmd, input)
  .then(out => {
    // ...
  }
  .catch(err) {
    throw ("p4 not found");
  };

// Asynchro with async-await
try {
  let out = await p4.cmd(p4Cmd, input);
} catch (err) {
  throw ("p4 not found");
}


// Synchro mode
try {
  let out = p4.cmdSync(p4Cmd, input);
} catch (err) {
  throw ("p4 not found");
}
```
Where:
- `p4Cmd` is the Perforce command (string) with options separated with space.
- `input` is a optional string or object for input value (like password for login command or client object for client command).

`p4.cmd()` return a promise which is resolved with the marshalled result of the command as an object (`out`).\
`p4.cmdSync()` return the marshal result of the command as an object (`out`).

`out` has the following structure:
- `prompt`: string printed by perforce before the result (else empty string)
- `stat`: if exists, list of all result with code=stat
- `info`: if exists, list of all result with code=info
- `error`: if exists, list of all result with code=error
 
#### Row syntax commands
```rawCmd(p4Cmd, [input])``` and ```rawCmdSync(p4Cmd, [input])``` allow to execute any p4 command using text syntax.
Arguments and result are similar to the last method except that the marshalled syntax is replaced with a raw text syntax.
Both raw methods return result as the following structure:
- `text`: success result string or empty string 
- `error`: error result string or empty string

### Error handling
When timeout is reached, cmd is rejected and cmdSync is throwed 
with a ```P4ApiTimeoutError``` ```Error``` instance 
with message like ```'Timeout <timeout>ms reached')``` 

``` javascript
import {P4, P4apiTimeoutError} from "p4api";
let p4 = new P4({P4PORT: "p4server:1666", P4API_TIMEOUT: 5000});

function P4Error(msg) {
  this.name = "p4 error";
  this.message = msg;
}

async function p4(cmd, input) {
  let out
  try {
    out = await p4.cmd(cmd, input)
  } catch (err) {
    if (err instanceof P4apiTimeoutError) {
      // Time out error
      throw new Error("p4 timeout " + err.timeout + " ms");
    }
    // Critical error : p4 is not installed ?
    throw new Error("p4 not found");
  }
  if (out.error !== undefined) {
    // p4 command error
    throw new P4Error(out.error);
  }
  return out;
}
```

#### Cancellation feature :
A promise returned by p4.cmd() can be canceled with ```cancel()``` method, killing launched p4 process.

<a name="Examples"></a>
## Examples
### List of depots
``` javascript
import {P4} from "p4api";
let p4 = new P4({P4PORT: "p4server:1666"});
    
p4.cmd("depots").then(function(out){console.log(out);});
```

Result is like:
``` json
    {
      "prompt": "",
      "stat": [
        {
          "code": "stat",
          "name": "CM",
          "time": "1314373478",
          "type": "local",
          "map": "/perforce/Data/CM/...",
          "desc": "Created by xxxx. ..."
        },
        {
          "code": "stat",
          "name": "depot",
          "time": "1314374519",
          "type": "local",
          "map": "/perforce/Data/depot/...",
          "desc": "Created by xxxx. ..."
        }
      ]
    }
```

### Command Error
``` javascript
    ...
    p4.cmd("mistake")
    ...
```

Result is:
``` json
{
  "prompt": "",
  "error": [
    {
      "code": "error",
      "data": "Unknown command.  Try \"p4 help\" for info.\n",
      "severity": 3,
      "generic": 1
    }
  ]
}
```

### Login (command with prompt and input)
``` javascript
    ...
    p4.cmd("login", "myGoodPasswd")
    ...
```
Result is like:
``` json
{
  "prompt": "Enter password: ↵",
  "info": [
    {
      "code": "info",
      "data": "Success:  Password verified.",
      "level": 5
    },
    {
      "code": "info",
      "data": "User toto logged in.",
      "level": 0
    }
  ]
}
```

### Check Login (command with param)
``` javascript
    ...
    p4.cmd("login -s")
    ...
```
Result is like:
``` json
{
  "prompt": "",
  "stat": [
    {
      "code": "stat",
      "TicketExpiration": "85062",
      "user": "toto"
    }
  ]
}   
```

### Clear viewpathes of the current Client
``` javascript
async function clearViewPathes() {
  let out = await p4.cmd("client -o")
  let client = out.stat[0]
  for (let i = 0;; i++) {
    if (client["View" + i] === undefined) break
    delete client["View" + i]
  }
  await p4.cmd("client -i", client)
  await p4.cmd("sync -f")
}

```

### Cancellation
``` javascript
let p4Promise = p4.cmd("clients");
...
let   result = null;
if (DoNotNeedResult) {
  p4Promise.cancel();
} else {
  result = await p4Promise;
}
```

