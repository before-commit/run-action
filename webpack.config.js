const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    target: 'node',
    entry: './index.js',
    mode: 'production',
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    mangle: false,
                    sourceMap: true,
                    compress: false,
                    keep_classnames: true,
                    keep_fnames: true,
                    output: {
                        comments: false,
                    },
                }
            }),
        ],
      },
};
