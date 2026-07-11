import { ProfessionalDNA } from '../../features/resume/models/professionalDNA.model.js';

import type { SeedUsersMap } from '../seed.types.js';

export async function seedVeredProfessionalDNA(
  users: SeedUsersMap
): Promise<void> {
  const user = users.vered;

  const professionalDNA = await ProfessionalDNA.create({
    userId: user._id,

    candidateName: 'Vered Sivan Abramovich',
    candidateEmail: 'vered054819@gmail.com',

    rawResumeText: [
      'Vered Sivan Abramovich',
      'vered054819@gmail.com | +972-54-4733679',
      '',
      'Motivated Computer Science student with extensive experience in training,',
      'instructional program management, and implementation of learning systems in',
      'organizations. Strong analytical and organizational skills, a high technical aptitude,',
      'and excellent interpersonal abilities. Fast learner with proven ability to work across',
      'technical interfaces.',
      '',
      'PROFESSIONAL EXPERIENCE',
      '',
      'Instructional Project Manager | IAI – Israel Aerospace Industries',
      'March 2025 – Present',
      'Managing instructional projects in the aerospace engineering domain, including',
      'schedule planning, budgeting, and requirements analysis in collaboration with',
      'engineers and project managers.',
      'Identifying knowledge gaps and implementing data-driven improvements based on',
      'ongoing user feedback.',
      'Coordinating between development, training, and management teams to integrate',
      'learning systems and manage complex processes.',
      'Holds a valid Security Clearance.',
      '',
      'Technology Instructor | Ministry of Defense',
      'August 2023 – February 2025',
      'Led the onboarding and instruction for a new simulator system, tailored to the',
      'trainees’ needs.',
      'Managed performance reports and debriefings to identify improvement opportunities.',
      'Collaborated with international partners and external entities to enhance system',
      'capabilities.',
      '',
      'MILITARY SERVICE',
      '',
      'Simulator Trainer | Israeli Navy – Flotilla 13 (Shayetet 13)',
      'September 2020 – May 2023',
      'Delivered professional training for operational simulators.',
      'Led a team of instructors and managed daily training activities.',
      'Mentored and guided new instructors.',
      'Analyzed monthly performance reports and derived actionable operational insights.',
      'Awarded the Israeli Navy Commander’s Excellence Award for Independence Day 2022.',
      '',
      'EDUCATION',
      '',
      'B.Sc. in Computer Science | The College of Management Academic Studies – Rishon LeZion',
      '2024 – 2026 (Expected)',
      'Core Courses: Introduction to Programming (C/C++), Discrete Mathematics, Data Structures, Mathematical Logic',
      'Skills Acquired: Logical thinking, problem-solving, object-oriented programming, algorithmic development',
      '',
      'Industrial Engineering and Management Diploma | Ministry of Education',
      '2020',
      'Full Matriculation Certificate with honors – 5 units in Physics and Mathematics',
      'Completed 10 academic units including a final project in operations and production management',
    ].join('\n'),

    analysisStatus: 'completed',

    skills: [
      {
        name: 'Project Management',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 3,
      },
      {
        name: 'Instructional Program Management',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 4,
      },
      {
        name: 'Training and Instruction',
        category: 'soft',
        proficiencyLevel: 'expert',
        yearsOfExperience: 5,
      },
      {
        name: 'Requirements Analysis',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 2,
      },
      {
        name: 'Data Analysis',
        category: 'technical',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 3,
      },
      {
        name: 'Cross-functional Collaboration',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 4,
      },
      {
        name: 'C',
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
        name: 'Object-Oriented Programming',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'Data Structures',
        category: 'technical',
        proficiencyLevel: 'intermediate',
        yearsOfExperience: 1,
      },
      {
        name: 'Problem Solving',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 4,
      },
      {
        name: 'Leadership',
        category: 'soft',
        proficiencyLevel: 'advanced',
        yearsOfExperience: 3,
      },
    ],

    experience: [
      {
        company: 'IAI – Israel Aerospace Industries',
        role: 'Instructional Project Manager',
        startDate: new Date('2025-03-01'),
        isCurrent: true,
        description:
          'Managing instructional projects in the aerospace engineering domain, including schedule planning, budgeting, requirements analysis, knowledge-gap identification, and coordination between development, training, and management teams.',
        extractedSkills: [
          'Project Management',
          'Requirements Analysis',
          'Budgeting',
          'Schedule Planning',
          'Data Analysis',
          'Cross-functional Collaboration',
        ],
      },
      {
        company: 'Ministry of Defense',
        role: 'Technology Instructor',
        startDate: new Date('2023-08-01'),
        endDate: new Date('2025-02-28'),
        isCurrent: false,
        description:
          'Led onboarding and instruction for a simulator system, managed performance reports and debriefings, and collaborated with international partners and external entities.',
        extractedSkills: [
          'Technical Training',
          'Onboarding',
          'Performance Analysis',
          'Debriefing',
          'International Collaboration',
        ],
      },
      {
        company: 'Israeli Navy – Flotilla 13',
        role: 'Simulator Trainer',
        startDate: new Date('2020-09-01'),
        endDate: new Date('2023-05-31'),
        isCurrent: false,
        description:
          'Delivered professional simulator training, led a team of instructors, mentored new instructors, and analyzed monthly performance reports.',
        extractedSkills: [
          'Training',
          'Leadership',
          'Mentoring',
          'Performance Analysis',
          'Operational Instruction',
        ],
      },
    ],

    education: [
      {
        institution: 'The College of Management Academic Studies',
        degree: 'B.Sc.',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2026-12-31'),
      },
      {
        institution: 'Ministry of Education',
        degree: 'Diploma',
        fieldOfStudy: 'Industrial Engineering and Management',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-12-31'),
      },
    ],

    profileSummary: {
      hasDegree: false,
      highestDegree: 'B.Sc. in Computer Science – in progress',
      fieldOfStudy: 'Computer Science',
      institution: 'The College of Management Academic Studies',
      totalYearsOfExperience: 5,
      lastRoleTitle: 'Instructional Project Manager',
      lastRoleCompany: 'IAI – Israel Aerospace Industries',
      topSkills: [
        'Project Management',
        'Training and Instruction',
        'Requirements Analysis',
        'Data Analysis',
        'Leadership',
        'Problem Solving',
      ],
      recommendedCourses: [
        'Advanced Software Development',
        'Database Systems',
        'Cloud Computing Fundamentals',
        'Agile Project Management',
      ],
    },

    gapAnalysis: {
      overallScore: 78,
      strengths: [
        'Strong experience in training, instruction, and program management',
        'Proven leadership and mentoring experience',
        'Experience coordinating between technical and management teams',
        'Strong analytical and organizational abilities',
        'Practical exposure to computer science and algorithmic thinking',
      ],
      gaps: [
        'Limited formal software development experience in production environments',
        'Limited experience with modern web development frameworks',
        'Limited experience with cloud platforms and DevOps tools',
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'Software Development',
          suggestion:
            'Build and publish practical software projects that demonstrate end-to-end development skills.',
          resourceLinks: [],
        },
        {
          priority: 'high',
          category: 'Web Development',
          suggestion:
            'Strengthen practical experience with JavaScript, TypeScript, React, Node.js, and databases.',
          resourceLinks: [],
        },
        {
          priority: 'medium',
          category: 'Cloud and DevOps',
          suggestion:
            'Gain hands-on experience with Docker, CI/CD, and a major cloud platform.',
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