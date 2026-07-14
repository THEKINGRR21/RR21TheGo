// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const path = require('path');

const noHexLiteralsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Bans hex color literals in the codebase except for theme/tokens.ts',
    },
    schema: [],
    messages: {
      noHex: 'Raw hex color literal "{{ value }}" is banned. Use tokens from src/theme/tokens.ts instead.',
    },
  },
  create(context) {
    const filename = context.filename || (context.getFilename && context.getFilename()) || '';
    
    // Exclude tokens file and any config/non-src files
    const isTokensFile = filename.endsWith('tokens.ts') || filename.endsWith('tokens.js');
    if (isTokensFile) {
      return {};
    }

    const hexRegex = /#([0-9A-F]{3,4}|[0-9A-F]{6}|[0-9A-F]{8})\b/i;

    function checkLiteral(node, value) {
      if (typeof value === 'string' && hexRegex.test(value)) {
        // Also ensure we're only linting files inside src
        const relativePath = path.relative(context.cwd || process.cwd(), filename);
        if (relativePath.split(path.sep).includes('src')) {
          context.report({
            node,
            messageId: 'noHex',
            data: { value },
          });
        }
      }
    }

    return {
      Literal(node) {
        checkLiteral(node, node.value);
      },
      TemplateElement(node) {
        checkLiteral(node, node.value.raw);
      },
    };
  },
};

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*"],
  },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      custom: {
        rules: {
          "no-hex-literals": noHexLiteralsRule,
        },
      },
    },
    rules: {
      "custom/no-hex-literals": "error",
    },
  }
]);
