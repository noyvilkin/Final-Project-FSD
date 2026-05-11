// key = lowercase normalised form used for matching
// value = the display name we want in the DB
const CANONICAL_SKILLS: Record<string, string> = {
  // JavaScript ecosystem
  'javascript':     'JavaScript',
  'typescript':     'TypeScript',
  'react':          'React.js',
  'reactjs':        'React.js',
  'react.js':       'React.js',
  'react native':   'React Native',
  'reactnative':    'React Native',
  'next':           'Next.js',
  'nextjs':         'Next.js',
  'next.js':        'Next.js',
  'vue':            'Vue.js',
  'vuejs':          'Vue.js',
  'vue.js':         'Vue.js',
  'nuxt':           'Nuxt.js',
  'nuxtjs':         'Nuxt.js',
  'angular':        'Angular',
  'angularjs':      'AngularJS',
  'svelte':         'Svelte',
  'node':           'Node.js',
  'nodejs':         'Node.js',
  'node.js':        'Node.js',
  'express':        'Express.js',
  'expressjs':      'Express.js',
  'express.js':     'Express.js',
  'nestjs':         'NestJS',
  'nest':           'NestJS',
  'graphql':        'GraphQL',
  'apollo':         'Apollo GraphQL',
  'webpack':        'Webpack',
  'vite':           'Vite',
  // Databases
  'mongodb':        'MongoDB',
  'mongo':          'MongoDB',
  'mongoose':       'Mongoose',
  'postgresql':     'PostgreSQL',
  'postgres':       'PostgreSQL',
  'mysql':          'MySQL',
  'sqlite':         'SQLite',
  'redis':          'Redis',
  'elasticsearch':  'Elasticsearch',
  'dynamodb':       'DynamoDB',
  'firebase':       'Firebase',
  'supabase':       'Supabase',
  'prisma':         'Prisma',
  'sequelize':      'Sequelize',
  // Backend / languages
  'python':         'Python',
  'django':         'Django',
  'flask':          'Flask',
  'fastapi':        'FastAPI',
  'java':           'Java',
  'spring':         'Spring Boot',
  'springboot':     'Spring Boot',
  'spring boot':    'Spring Boot',
  'kotlin':         'Kotlin',
  'golang':         'Go',
  'go':             'Go',
  'rust':           'Rust',
  'ruby':           'Ruby',
  'rails':          'Ruby on Rails',
  'ruby on rails':  'Ruby on Rails',
  'php':            'PHP',
  'laravel':        'Laravel',
  'c#':             'C#',
  'csharp':         'C#',
  'dotnet':         '.NET',
  '.net':           '.NET',
  'asp.net':        'ASP.NET',
  'c++':            'C++',
  'cpp':            'C++',
  'swift':          'Swift',
  'scala':          'Scala',
  // Cloud & DevOps
  'aws':                  'AWS',
  'amazon web services':  'AWS',
  'gcp':                  'Google Cloud Platform',
  'google cloud':         'Google Cloud Platform',
  'azure':                'Microsoft Azure',
  'docker':               'Docker',
  'kubernetes':           'Kubernetes',
  'k8s':                  'Kubernetes',
  'terraform':            'Terraform',
  'ansible':              'Ansible',
  'jenkins':              'Jenkins',
  'github actions':       'GitHub Actions',
  'ci/cd':                'CI/CD',
  'cicd':                 'CI/CD',
  'nginx':                'NGINX',
  // AI / ML
  'tensorflow':   'TensorFlow',
  'pytorch':      'PyTorch',
  'scikit-learn': 'scikit-learn',
  'sklearn':      'scikit-learn',
  'langchain':    'LangChain',
  'openai':       'OpenAI API',
  'llm':          'LLMs',
  // Testing
  'jest':         'Jest',
  'mocha':        'Mocha',
  'cypress':      'Cypress',
  'playwright':   'Playwright',
  'vitest':       'Vitest',
  // Other tools
  'git':          'Git',
  'github':       'GitHub',
  'gitlab':       'GitLab',
  'jira':         'Jira',
  'figma':        'Figma',
  'linux':        'Linux',
  'bash':         'Bash',
  'shell':        'Shell Scripting',
  'rest':         'REST APIs',
  'rest api':     'REST APIs',
  'restful':      'REST APIs',
  'grpc':         'gRPC',
  'websockets':   'WebSockets',
  'websocket':    'WebSockets',
  'microservices':'Microservices',
  'agile':        'Agile',
  'scrum':        'Scrum',
};

export class SkillNormalizer {
  // Normalise a single raw skill string to its canonical form.
  // Strategy: exact → compact-fuzzy → prefix → title-case fallback.
  normalize(raw: string): string {
    const trimmed = raw.trim();
    const key = this.toKey(trimmed);

    if (CANONICAL_SKILLS[key]) return CANONICAL_SKILLS[key];

    const compact = key.replace(/[\s.\-_]/g, '');
    if (CANONICAL_SKILLS[compact]) return CANONICAL_SKILLS[compact];

    const prefixMatch = Object.keys(CANONICAL_SKILLS)
      .filter(k => compact.startsWith(k) || k.startsWith(compact))
      .sort((a, b) => b.length - a.length)[0];
    if (prefixMatch) return CANONICAL_SKILLS[prefixMatch];

    return this.toTitleCase(trimmed);
  }

  // Normalise an array of raw skills, deduplicating by canonical name.
  normalizeAll(raws: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of raws) {
      if (!raw.trim()) continue;
      const canonical = this.normalize(raw);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        result.push(canonical);
      }
    }
    return result;
  }

  private toKey(s: string): string {
    return s.toLowerCase().trim();
  }

  private toTitleCase(s: string): string {
    return s
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
