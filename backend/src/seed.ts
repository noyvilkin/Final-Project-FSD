import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from './features/user/models/user.model.js';
import { ProfessionalDNA } from './features/resume/models/professionalDNA.model.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/careerpilot';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('[seed] Connected to', MONGO_URI);

  // ── Cleanup previous seed data ──────────────────────────────────
  const existing = await User.findOne({ email: 'demo@careerpilot.dev' });
  if (existing) {
    await ProfessionalDNA.deleteMany({ userId: existing._id });
    await User.deleteOne({ _id: existing._id });
    console.log('[seed] Cleaned up previous demo user');
  }

  // ── Create demo user ────────────────────────────────────────────
  const user = await User.create({
    email: 'demo@careerpilot.dev',
    passwordHash: '$2b$10$placeholder_hash_not_for_login',
    profile: {
      firstName: 'Dana',
      lastName: 'Cohen',
      phone: '+972-50-1234567',
      linkedIn: 'https://linkedin.com/in/danacohen',
    },
    isActive: true,
  });

  console.log('[seed] User created:', user._id.toString(), '—', user.email);

  // ── Create Professional DNA ─────────────────────────────────────
  const dna = await ProfessionalDNA.create({
    userId: user._id,
    analysisStatus: 'completed',
    skills: [
      { name: 'TypeScript',  category: 'technical', proficiencyLevel: 'expert',       yearsOfExperience: 4 },
      { name: 'JavaScript',  category: 'technical', proficiencyLevel: 'expert',       yearsOfExperience: 6 },
      { name: 'React',       category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
      { name: 'Node.js',     category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
      { name: 'Express',     category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
      { name: 'MongoDB',     category: 'tool',      proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
      { name: 'PostgreSQL',  category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
      { name: 'Docker',      category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 3 },
      { name: 'AWS',         category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
      { name: 'Git',         category: 'tool',      proficiencyLevel: 'advanced',     yearsOfExperience: 6 },
      { name: 'REST API',    category: 'technical', proficiencyLevel: 'expert',       yearsOfExperience: 5 },
      { name: 'GraphQL',     category: 'technical', proficiencyLevel: 'intermediate', yearsOfExperience: 1 },
      { name: 'Jest',        category: 'tool',      proficiencyLevel: 'advanced',     yearsOfExperience: 3 },
      { name: 'CI/CD',       category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
      { name: 'Agile',       category: 'soft',      proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
      { name: 'Team Leadership', category: 'soft',  proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
    ],
    experience: [
      {
        company: 'Skyline Tech',
        role: 'Senior Full Stack Developer',
        startDate: new Date('2022-06-01'),
        isCurrent: true,
        description:
          'Led the development of a multi-tenant SaaS platform serving 15K+ users. ' +
          'Built real-time dashboards using React and WebSocket, reduced API response times by 40% ' +
          'through query optimization and caching layers.',
        extractedSkills: ['React', 'Node.js', 'MongoDB', 'WebSocket', 'Redis'],
      },
      {
        company: 'DataBridge Solutions',
        role: 'Full Stack Developer',
        startDate: new Date('2020-03-01'),
        endDate: new Date('2022-05-31'),
        isCurrent: false,
        description:
          'Designed and implemented RESTful microservices handling 2M+ daily requests. ' +
          'Migrated legacy jQuery frontend to React with TypeScript, improving load times by 60%. ' +
          'Established CI/CD pipelines with GitHub Actions and Docker.',
        extractedSkills: ['TypeScript', 'React', 'Express', 'Docker', 'CI/CD'],
      },
      {
        company: 'WebCraft Agency',
        role: 'Junior Developer',
        startDate: new Date('2018-09-01'),
        endDate: new Date('2020-02-28'),
        isCurrent: false,
        description:
          'Developed responsive client websites using JavaScript, HTML/CSS, and Node.js. ' +
          'Maintained PostgreSQL databases and wrote automated test suites with Jest. ' +
          'Participated in daily standups and bi-weekly sprint planning.',
        extractedSkills: ['JavaScript', 'Node.js', 'PostgreSQL', 'Jest'],
      },
    ],
    education: [
      {
        institution: 'Tel Aviv University',
        degree: 'B.Sc.',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2015-10-01'),
        endDate: new Date('2018-07-01'),
        gpa: 3.7,
      },
    ],
    gapAnalysis: {
      overallScore: 78,
      strengths: [
        'Strong full-stack JavaScript/TypeScript expertise',
        'Production experience with React and Node.js',
        'Solid understanding of RESTful API design',
      ],
      gaps: [
        'Limited cloud-native and Kubernetes experience',
        'No formal system design or architecture certifications',
        'GraphQL experience is shallow',
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'Cloud',
          suggestion: 'Obtain AWS Solutions Architect Associate certification',
          resourceLinks: ['https://aws.amazon.com/certification/'],
        },
        {
          priority: 'medium',
          category: 'Architecture',
          suggestion: 'Study system design patterns and practice with mock interviews',
          resourceLinks: [],
        },
      ],
    },
  });

  // Link DNA back to user
  await User.findByIdAndUpdate(user._id, { latestProfessionalDNA: dna._id });

  console.log('[seed] Professional DNA created:', dna._id.toString());
  console.log();
  console.log('════════════════════════════════════════════════════');
  console.log('  Seed complete! Use this userId to test:');
  console.log();
  console.log(`  userId: ${user._id.toString()}`);
  console.log(`  email:  ${user.email}`);
  console.log(`  name:   ${user.profile.firstName} ${user.profile.lastName}`);
  console.log('════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
