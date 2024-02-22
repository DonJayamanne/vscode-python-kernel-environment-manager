module.exports = {
    env: {
        browser: true,
        es6: true,
        node: true,
    },
    extends: ['prettier'],
    ignorePatterns: ['*.js', 'vscode.*.d.ts', 'vscode.d.ts', 'types'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
    },
    plugins: [
        'eslint-plugin-import',
        'eslint-plugin-jsdoc',
        'eslint-plugin-no-null',
        'eslint-plugin-prefer-arrow',
        '@typescript-eslint',
        '@typescript-eslint/tslint',
        'eslint-plugin-local-rules',
        'no-only-tests',
    ],
    rules: {
        // Overriding ESLint rules with Typescript-specific ones
        '@typescript-eslint/ban-ts-comment': [
            'error',
            {
                'ts-ignore': 'allow-with-description',
            },
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'no-bitwise': 'off',
        'no-dupe-class-members': 'off',
        '@typescript-eslint/no-dupe-class-members': 'error',
        'no-empty-function': 'off',
        '@typescript-eslint/no-empty-function': ['error'],
        '@typescript-eslint/no-empty-interface': 'off',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '_\\w*' }],
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': [
            'error',
            {
                functions: false,
            },
        ],
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-floating-promises': [
            'error',
            {
                ignoreVoid: true,
            },
        ],

        // Other rules
        'class-methods-use-this': 'off',
        'func-names': 'off',
        'import/extensions': 'off',
        'import/namespace': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-unresolved': [
            'error',
            {
                ignore: ['monaco-editor', 'vscode'],
            },
        ],
        'import/prefer-default-export': 'off',
        'linebreak-style': 'off',
        'no-await-in-loop': 'off',
        'no-console': 'off',
        'no-control-regex': 'off',
        'no-extend-native': 'off',
        'no-multi-str': 'off',
        'no-param-reassign': 'off',
        'no-prototype-builtins': 'off',
        'no-restricted-syntax': [
            'error',
            {
                selector: 'ForInStatement',
                message:
                    'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
            },

            {
                selector: 'LabeledStatement',
                message:
                    'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
            },
            {
                selector: 'WithStatement',
                message:
                    '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
            },
        ],
        'no-template-curly-in-string': 'off',
        'no-underscore-dangle': 'off',
        'no-useless-escape': 'off',
        'no-void': [
            'error',
            {
                allowAsStatement: true,
            },
        ],
        'operator-assignment': 'off',
        'react/jsx-filename-extension': [
            1,
            {
                extensions: ['.tsx'],
            },
        ],
        'react/jsx-uses-vars': 'error',
        'react/jsx-uses-react': 'error',
        'no-restricted-imports': 'off',
        'local-rules/node-imports': ['error'],
        'local-rules/dont-use-process': ['error'],
        'local-rules/dont-use-fspath': ['error'],
        'local-rules/dont-use-filename': ['error'],
        strict: 'off',
    },
    overrides: [
        // {
        //     files: ['gulpfile.js', 'build/**/*.js'],
        //     rules: {
        //         'local-rules/node-imports': ['off'],
        //         'local-rules/dont-use-process': ['off'],
        //         'local-rules/dont-use-fspath': ['off'],
        //         'local-rules/dont-use-filename': ['off'],
        //         'import/no-restricted-paths': ['off'],
        //     },
        // },
        // {
        //     files: ['**/*.test.ts'],
        //     rules: {
        //         '@typescript-eslint/no-explicit-any': 'off',
        //         '@typescript-eslint/no-restricted-imports': 'off',
        //     },
        // },
        // {
        //     files: ['src/test/**/*.ts'],
        //     rules: {
        //         '@typescript-eslint/no-explicit-any': 'off',
        //         '@typescript-eslint/no-restricted-imports': 'off',
        //     },
        // },
        // {
        //     files: ['src/*.d.ts'],
        //     rules: {
        //         // Keep the *.d.ts files clean of any linting suppressions.
        //         // These files will be distributed as is as part of the npm package.
        //         '@typescript-eslint/no-explicit-any': 'off',
        //         '@typescript-eslint/no-unused-vars': 'off',
        //     },
        // },
    ],
    settings: {
        'import/extensions': ['.ts', '.tsx', '.d.ts', '.js', '.jsx'],
        'import/external-module-folders': ['node_modules', 'node_modules/@types'],
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
        },
        'import/resolver': {
            node: {
                extensions: ['.ts', '.tsx', '.d.ts', '.js', '.jsx'],
            },
        },
        propWrapperFunctions: ['forbidExtraProps', 'exact', 'Object.freeze'],
        'import/core-modules': [],
        'import/ignore': ['node_modules', '\\.(coffee|scss|css|less|hbs|svg|json)$'],
    },
};