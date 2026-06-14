import { SkillNormalizer } from '../skillNormalizer.js';

const normalizer = new SkillNormalizer();

// ---------------------------------------------------------------------------
// Exact canonical matches (case-insensitive)
// ---------------------------------------------------------------------------

describe('SkillNormalizer — exact matches', () => {
  const cases: [string, string][] = [
    ['react',       'React.js'],
    ['React',       'React.js'],
    ['REACT',       'React.js'],
    ['react.js',    'React.js'],
    ['reactjs',     'React.js'],
    ['node',        'Node.js'],
    ['nodejs',      'Node.js'],
    ['node.js',     'Node.js'],
    ['typescript',  'TypeScript'],
    ['TypeScript',  'TypeScript'],
    ['javascript',  'JavaScript'],
    ['next',        'Next.js'],
    ['nextjs',      'Next.js'],
    ['next.js',     'Next.js'],
    ['vue',         'Vue.js'],
    ['vuejs',       'Vue.js'],
    ['angular',     'Angular'],
    ['angularjs',   'AngularJS'],
    ['express',     'Express.js'],
    ['expressjs',   'Express.js'],
    ['nestjs',      'NestJS'],
    ['nest',        'NestJS'],
    ['graphql',     'GraphQL'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Database / data layer
// ---------------------------------------------------------------------------

describe('SkillNormalizer — databases', () => {
  const cases: [string, string][] = [
    ['mongodb',     'MongoDB'],
    ['mongo',       'MongoDB'],
    ['mongoose',    'Mongoose'],
    ['postgresql',  'PostgreSQL'],
    ['postgres',    'PostgreSQL'],
    ['mysql',       'MySQL'],
    ['redis',       'Redis'],
    ['dynamodb',    'DynamoDB'],
    ['firebase',    'Firebase'],
    ['prisma',      'Prisma'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Cloud & DevOps
// ---------------------------------------------------------------------------

describe('SkillNormalizer — cloud & devops', () => {
  const cases: [string, string][] = [
    ['aws',                 'AWS'],
    ['amazon web services', 'AWS'],
    ['docker',              'Docker'],
    ['kubernetes',          'Kubernetes'],
    ['k8s',                 'Kubernetes'],
    ['terraform',           'Terraform'],
    ['ci/cd',               'CI/CD'],
    ['cicd',                'CI/CD'],
    ['github actions',      'GitHub Actions'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Backend languages
// ---------------------------------------------------------------------------

describe('SkillNormalizer — languages', () => {
  const cases: [string, string][] = [
    ['python',  'Python'],
    ['java',    'Java'],
    ['golang',  'Go'],
    ['go',      'Go'],
    ['rust',    'Rust'],
    ['c#',      'C#'],
    ['csharp',  'C#'],
    ['c++',     'C++'],
    ['cpp',     'C++'],
    ['php',     'PHP'],
    ['swift',   'Swift'],
    ['kotlin',  'Kotlin'],
    ['ruby',    'Ruby'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

describe('SkillNormalizer — frameworks', () => {
  const cases: [string, string][] = [
    ['django',        'Django'],
    ['flask',         'Flask'],
    ['fastapi',       'FastAPI'],
    ['spring',        'Spring Boot'],
    ['springboot',    'Spring Boot'],
    ['spring boot',   'Spring Boot'],
    ['rails',         'Ruby on Rails'],
    ['ruby on rails', 'Ruby on Rails'],
    ['laravel',       'Laravel'],
    ['dotnet',        '.NET'],
    ['.net',          '.NET'],
    ['asp.net',       'ASP.NET'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// AI / ML and Testing
// ---------------------------------------------------------------------------

describe('SkillNormalizer — AI/ML and testing', () => {
  const cases: [string, string][] = [
    ['tensorflow',   'TensorFlow'],
    ['pytorch',      'PyTorch'],
    ['scikit-learn', 'scikit-learn'],
    ['sklearn',      'scikit-learn'],
    ['langchain',    'LangChain'],
    ['jest',         'Jest'],
    ['cypress',      'Cypress'],
    ['playwright',   'Playwright'],
    ['vitest',       'Vitest'],
  ];

  it.each(cases)('normalize(%j) → %j', (input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Whitespace trimming
// ---------------------------------------------------------------------------

describe('SkillNormalizer — whitespace handling', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizer.normalize('  react  ')).toBe('React.js');
  });

  it('handles tab characters', () => {
    expect(normalizer.normalize('\tnode\t')).toBe('Node.js');
  });
});

// ---------------------------------------------------------------------------
// Title-case fallback for unknown skills
// ---------------------------------------------------------------------------

describe('SkillNormalizer — title-case fallback', () => {
  it('title-cases a single-word unknown skill', () => {
    expect(normalizer.normalize('hadoop')).toBe('Hadoop');
  });

  it('title-cases a multi-word unknown skill', () => {
    expect(normalizer.normalize('machine learning')).toBe('Machine Learning');
  });

  it('preserves existing capitalization only for first char of each word', () => {
    const result = normalizer.normalize('data engineering');
    expect(result).toBe('Data Engineering');
  });
});

// ---------------------------------------------------------------------------
// normalizeAll — batch + dedup
// ---------------------------------------------------------------------------

describe('SkillNormalizer — normalizeAll', () => {
  it('normalizes and deduplicates an array of skills', () => {
    const input = ['react', 'React.js', 'reactjs', 'node', 'Node.js'];
    const result = normalizer.normalizeAll(input);
    expect(result).toEqual(['React.js', 'Node.js']);
  });

  it('preserves order of first occurrence', () => {
    const input = ['typescript', 'react', 'node'];
    const result = normalizer.normalizeAll(input);
    expect(result).toEqual(['TypeScript', 'React.js', 'Node.js']);
  });

  it('skips empty and whitespace-only entries', () => {
    const input = ['react', '', '  ', 'node'];
    const result = normalizer.normalizeAll(input);
    expect(result).toEqual(['React.js', 'Node.js']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizer.normalizeAll([])).toEqual([]);
  });

  it('handles mixed known and unknown skills', () => {
    const input = ['react', 'Solidity', 'node', 'blockchain development'];
    const result = normalizer.normalizeAll(input);
    expect(result).toEqual(['React.js', 'Solidity', 'Node.js', 'Blockchain Development']);
  });
});
