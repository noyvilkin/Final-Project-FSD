import { ProfessionalDNA } from '../../features/resume/models/professionalDNA.model.js';

import type { SeedUsersMap } from '../seed.types.js';

export async function seedYuvalProfessionalDNA(
  users: SeedUsersMap
): Promise<void> {
  const user = users.yuval;

  const professionalDNA = await ProfessionalDNA.create({
    userId: user._id,

    candidateName: 'Yuval Nurlian',
    candidateEmail: 'Yuvalnur5@gmail.com',

    rawResumeText: [
      'Yuval Nurlian',
      'Yuvalnur5@gmail.com | 054-8119777',
      'Yehud-Monosson',
      '',
      'FULL-STACK DEVELOPER',
      '',
      'Full-Stack Developer with over 2 years of hands-on experience developing',
      'and maintaining enterprise web applications end-to-end.',
      'Experienced in translating business requirements into scalable technical',
      'solutions, with strong ownership, problem-solving skills and a fast learning curve.',
      '',
      'WORK EXPERIENCE',
      '',
      'Full-Stack Information Systems Developer | Israel Aerospace Industries',
      '2023 – Present',
      'Full ownership of end-to-end development of enterprise information systems,',
      'from requirements analysis and system design to production deployment and maintenance.',
      'Close collaboration with internal stakeholders to gather business requirements,',
      'define specifications and translate needs into technical solutions.',
      'Designed relational databases using Oracle SQL, including schema design,',
      'data modeling and complex SQL queries.',
      'Developed backend services and business logic using C# and .NET Framework.',
      'Developed frontend applications using Angular, TypeScript, HTML and CSS.',
      'Performed functional testing, bug fixing, version releases and production support.',
      '',
      'FREELANCE / INDEPENDENT PROJECTS',
      '',
      'Developed a product exchange platform with ML-based matching',
      'and Gemini API integration.',
      'Designed and developed a subscription management prototype,',
      'including UX/UI design in Figma.',
      '',
      'ADDITIONAL EXPERIENCE',
      '',
      'Private Mathematics Tutor | 2024 – Present',
      'Provided one-on-one mathematics tutoring for middle and high school students,',
      'including matriculation exam preparation.',
      '',
      'MILITARY SERVICE',
      '',
      'Technological Instructor | Technology and Maintenance Corps',
      '2017 – 2020',
      'Conducted professional technical training for soldiers.',
      'Trained personnel in fault diagnosis and troubleshooting.',
      '',
      'EDUCATION',
      '',
      'B.Sc. in Computer Science | Afeka College of Engineering',
      '2022 – 2025',
      'Algorithms: 100',
      'Data Structures: 99',
      'Software Engineering: 94',
      'Machine Learning: 98',
      'Databases: 90',
      '',
      'SKILLS',
      '',
      'Angular, TypeScript, HTML, CSS, C#, .NET Framework, Node.js,',
      'Oracle SQL, Java, C, C++, Figma, Machine Learning, Gemini API',
      '',
      'LANGUAGES',
      '',
      'Hebrew: Native',
      'English: Excellent',
    ].join('\n'),

    analysisStatus: 'completed',

    skills: [
      {
        name: 'Angular',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'TypeScript',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'C#',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: '.NET Framework',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'Oracle SQL',
        category: 'tool',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'Node.js',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'HTML',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'CSS',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'Java',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'C++',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'Machine Learning',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'Figma',
        category: 'tool',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'Problem Solving',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 3,
      },
      {
        name: 'Requirements Analysis',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'Hebrew',
        category: 'language',
        proficiencyLevel: 'expert',
      },
      {
        name: 'English',
        category: 'language',
        proficiencyLevel: 'advanced',
      },
    ],

    experience: [
      {
        company: 'Israel Aerospace Industries',
        role: 'Full-Stack Information Systems Developer',
        startDate: new Date('2023-01-01'),
        isCurrent: true,
        description:
          'End-to-end development of enterprise information systems, including requirements analysis, system design, database development, backend and frontend implementation, testing, deployment and ongoing maintenance.',
        extractedSkills: [
          'Angular',
          'TypeScript',
          'C#',
          '.NET Framework',
          'Oracle SQL',
          'Requirements Analysis',
          'System Design',
          'Production Support',
        ],
      },
      {
        company: 'Freelance / Independent Projects',
        role: 'Full-Stack Developer',
        startDate: new Date('2023-01-01'),
        isCurrent: true,
        description:
          'Developed a product exchange platform with machine-learning matching and Gemini API integration, and designed a subscription management application prototype.',
        extractedSkills: [
          'Full-Stack Development',
          'Machine Learning',
          'Gemini API',
          'Figma',
          'UX/UI',
        ],
      },
      {
        company: 'Private Tutoring',
        role: 'Private Mathematics Tutor',
        startDate: new Date('2024-01-01'),
        isCurrent: true,
        description:
          'Provides individual mathematics tutoring and matriculation exam preparation using teaching methods adapted to each student.',
        extractedSkills: [
          'Mathematics',
          'Teaching',
          'Communication',
          'Problem Solving',
        ],
      },
      {
        company: 'Technology and Maintenance Corps',
        role: 'Technological Instructor',
        startDate: new Date('2017-01-01'),
        endDate: new Date('2020-12-31'),
        isCurrent: false,
        description:
          'Conducted professional technical training, fault diagnosis and troubleshooting instruction for soldiers preparing for operational deployment.',
        extractedSkills: [
          'Technical Training',
          'Troubleshooting',
          'Leadership',
          'Instruction',
        ],
      },
    ],

    education: [
      {
        institution: 'Afeka College of Engineering',
        degree: 'B.Sc.',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2022-01-01'),
        endDate: new Date('2025-12-31'),
      },
    ],

    profileSummary: {
      hasDegree: true,
      highestDegree: 'B.Sc. in Computer Science',
      fieldOfStudy: 'Computer Science',
      institution: 'Afeka College of Engineering',
      totalYearsOfExperience: 2,
      lastRoleTitle: 'Full-Stack Information Systems Developer',
      lastRoleCompany: 'Israel Aerospace Industries',
      topSkills: [
        'Angular',
        'TypeScript',
        'C#',
        '.NET Framework',
        'Oracle SQL',
        'Requirements Analysis',
      ],
      recommendedCourses: [
        'Advanced Angular Architecture',
        'ASP.NET Core',
        'Cloud Computing Fundamentals',
        'Software System Design',
      ],
    },

    gapAnalysis: {
      overallScore: 86,

      strengths: [
        'Hands-on end-to-end development experience',
        'Strong frontend, backend and database capabilities',
        'Experience delivering and maintaining production systems',
        'Strong academic results in algorithms, data structures and machine learning',
        'Experience translating business requirements into technical solutions',
      ],

      gaps: [
        'Limited documented experience with cloud platforms',
        'Limited experience with modern DevOps and containerization tools',
        'Limited documented automated testing experience',
      ],

      recommendations: [
        {
          priority: 'high',
          category: 'Backend Development',
          suggestion:
            'Expand practical experience from .NET Framework to modern ASP.NET Core.',
          resourceLinks: [],
        },
        {
          priority: 'medium',
          category: 'Cloud',
          suggestion:
            'Gain hands-on experience deploying applications to Azure or AWS.',
          resourceLinks: [],
        },
        {
          priority: 'medium',
          category: 'DevOps',
          suggestion:
            'Add Docker, CI/CD and automated testing to a full-stack project.',
          resourceLinks: [],
        },
      ],
    },
  });

  await user.updateOne({
    latestProfessionalDNA: professionalDNA._id,
  });

  console.log(
    `[seed] Professional DNA created for ${user.email}`
  );
}