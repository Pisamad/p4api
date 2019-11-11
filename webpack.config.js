/* global __dirname, require, module */

const path = require('path')
const pkg = require('./package.json')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

const libraryName = pkg.name

module.exports = env => ({
  entry: path.join(__dirname, 'src', 'index.js'),
  devtool: 'source-map',
  target: 'node',
  mode: env.build ? 'production' : 'development',
  output: {
    path: path.join(__dirname, 'lib'),
    filename: libraryName + '.js',
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    rules: [
      {
        test: /(\.js)$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      },
      {
        test: /(\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    modules: [path.resolve('./node_modules'), path.resolve('./src')],
    extensions: ['.json', '.js']
  },
  plugins: [
    new CleanWebpackPlugin()
  ]
})
