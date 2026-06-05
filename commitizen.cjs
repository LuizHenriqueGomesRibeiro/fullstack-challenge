'use strict';

const HEADER_LIMIT = 72;
const BODY_WRAP = 100;

const TYPES = ['feat', 'fix', 'docs', 'chore', 'docker'];

const SCOPES = [
  { name: 'games (services/games)', value: 'games' },
  { name: 'wallets (services/wallets)', value: 'wallets' },
  { name: 'frontend (frontend)', value: 'frontend' },
  { name: 'contracts (packages/contracts)', value: 'contracts' },
  { name: 'none', value: '' },
];

const NON_IMPERATIVE_START =
  /^(adds?|added|adding|fixes?|fixed|fixing|updates?|updated|updating|creates?|created|creating|removes?|removed|removing|implements?|implemented|implementing|changes?|changed|changing|handles?|handled|handling|refactors?|refactored|refactoring)\b/i;

function headerPrefix(type, scope) {
  return `${type}${scope ? `(${scope})` : ''}: `;
}

function wrapParagraph(paragraph, width) {
  const words = paragraph.trim().split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if ((current + ' ' + word).length <= width) {
      current += ` ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\n');
}

function wrapBody(body, width = BODY_WRAP) {
  if (!body || !body.trim()) {
    return '';
  }

  return body
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) {
        return '';
      }

      if (/^\s{2,}/.test(line)) {
        return line;
      }

      return wrapParagraph(line, width);
    })
    .join('\n');
}

module.exports = {
  prompter(cz, commit) {
    cz
      .prompt([
        {
          type: 'list',
          name: 'type',
          message: 'Select the commit type:',
          choices: TYPES.map((value) => ({ name: value, value })),
        },
        {
          type: 'list',
          name: 'scope',
          message: 'Select the scope:',
          choices: SCOPES,
          default: '',
        },
        {
          type: 'input',
          name: 'subject',
          message: `Write the subject in imperative mood (no period, max ${HEADER_LIMIT} chars total):`,
          filter: (input) => input.trim(),
          validate: (input, answers) => {
            const subject = input.trim();

            if (!subject) {
              return 'Subject is required.';
            }

            if (subject.endsWith('.')) {
              return 'Do not end the subject with a period.';
            }

            const prefix = headerPrefix(answers?.type || 'feat', answers?.scope || '');
            const total = prefix.length + subject.length;

            if (total > HEADER_LIMIT) {
              return `The full header must stay within ${HEADER_LIMIT} chars. Current length: ${total}.`;
            }

            return true;
          },
        },
        {
          type: 'confirm',
          name: 'hasBody',
          message: 'Add a body?',
          default: false,
        },
        {
          type: 'editor',
          name: 'body',
          message: `Write the body (wrapped at ${BODY_WRAP} chars per line):`,
          when: (answers) => answers.hasBody,
          default: '',
        },
      ])
      .then((answers) => {
        const scope = answers.scope || '';
        const subject = answers.subject.trim();

        let message = `${headerPrefix(answers.type, scope)}${subject}`;
        const body = wrapBody(answers.body);

        if (body) {
          message += `\n\n${body}`;
        }

        commit(message);
      })
      .catch((error) => {
        if (error?.message) {
          console.error(error.message);
        }

        process.exit(1);
      });
  },
};
