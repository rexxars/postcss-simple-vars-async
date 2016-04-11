'use strict'

const postcss = require('postcss')

const definition = function (variables, node) {
  const name = node.prop.slice(1)
  variables[name] = node.value
  node.remove()
}

const variable = function (variables, node, str, name, opts, result) {
  if (opts.only) {
    return typeof opts.only[name] === 'undefined' ? str : opts.only[name]
  }

  if (typeof variables[name] !== 'undefined') {
    return variables[name]
  }

  if (opts.silent) {
    return str
  }

  const fix = opts.unknown(node, name, result)
  return fix || str
}

const simpleSyntax = function (variables, node, str, opts, result) {
  return str.replace(/(^|[^\w])\$([\w\d-_]+)/g, (__, bef, name) =>
    bef + variable(variables, node, `$${name}`, name, opts, result)
  )
}

const inStringSyntax = function (variables, node, str, opts, result) {
  return str.replace(/\$\(\s*([\w\d-_]+)\s*\)/g, (all, name) =>
    variable(variables, node, all, name, opts, result)
  )
}

const bothSyntaxes = function (variables, node, str, opts, result) {
  let res = str
  res = simpleSyntax(variables, node, res, opts, result)
  res = inStringSyntax(variables, node, res, opts, result)
  return res
}

const declValue = function (variables, node, opts, result) {
  node.value = bothSyntaxes(variables, node, node.value, opts, result)
}

const declProp = function (variables, node, opts, result) {
  node.prop = inStringSyntax(variables, node, node.prop, opts, result)
}

const ruleSelector = function (variables, node, opts, result) {
  node.selector = bothSyntaxes(variables, node, node.selector, opts, result)
}

const atruleParams = function (variables, node, opts, result) {
  node.params = bothSyntaxes(variables, node, node.params, opts, result)
}

module.exports = postcss.plugin('postcss-simple-vars', options => {
  const opts = typeof options === 'undefined' ? {} : options

  if (!opts.unknown) {
    opts.unknown = function (node, name) {
      throw node.error(`Undefined variable $${name}`)
    }
  }

  return function (css, result) {
    let vars = {}
    if (typeof opts.variables === 'function') {
      vars = opts.variables()
    } else if (typeof opts.variables === 'object') {
      Object.assign(vars, opts.variables)
    }

    if (typeof vars.then !== 'function') {
      vars = Promise.resolve(vars)
    }

    return vars.then(variables => {
      for (const name in variables) {
        if (name[0] === '$') {
          const fixed = name.slice(1)
          variables[fixed] = variables[name]
          delete variables[name]
        }
      }

      css.walk(node => {
        if (node.type === 'decl') {
          if (node.value.toString().indexOf('$') !== -1) {
            declValue(variables, node, opts, result)
          }

          if (node.prop.indexOf('$(') !== -1) {
            declProp(variables, node, opts, result)
          } else if (node.prop[0] === '$' && !opts.only) {
            definition(variables, node)
          }
        } else if (node.type === 'rule') {
          if (node.selector.indexOf('$') !== -1) {
            ruleSelector(variables, node, opts, result)
          }
        } else if (node.type === 'atrule') {
          if (node.params && node.params.indexOf('$') !== -1) {
            atruleParams(variables, node, opts, result)
          }
        }
      })

      if (opts.onVariables) {
        opts.onVariables(variables)
      }
    })
  }
})
