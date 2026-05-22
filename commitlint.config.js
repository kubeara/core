module.exports = {
  extends: ['@commitlint/config-conventional'],

  rules: {
    /*
     * Type Rules
     */
    'type-enum': [
      2,
      'always',
      [
        'feature',
        'fix',
        'docs',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],

    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    /*
     * Scope Rules
     */
    'scope-case': [2, 'always', 'lower-case'],
    'scope-empty': [0],

    /*
     * Subject Rules
     */
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [0],

    /*
     * Header Rules
     */
    'header-max-length': [2, 'always', 100],
    'header-min-length': [2, 'always', 10],

    /*
     * Body Rules
     */
    'body-leading-blank': [1, 'always'],

    /*
     * Footer Rules
     */
    'footer-leading-blank': [1, 'always'],
  },
};