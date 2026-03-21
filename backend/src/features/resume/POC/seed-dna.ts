import 'dotenv/config';
import mongoose from 'mongoose';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const existing = await ProfessionalDNA.find({}, '_id skills experience analysisStatus').lean();

  if (existing.length > 0) {
    console.log(`Found ${existing.length} existing ProfessionalDNA document(s):\n`);
    for (const d of existing) {
      console.log(`  ID: ${d._id}`);
      console.log(`  Skills: ${d.skills?.length ?? 0}, Experiences: ${d.experience?.length ?? 0}`);
      console.log(`  Status: ${d.analysisStatus}\n`);
    }
    console.log('Use any of the IDs above in the UI.');
  } else {
    const doc = await ProfessionalDNA.create({
      userId: new mongoose.Types.ObjectId(),
      skills: [
        { name: 'TypeScript', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 4 },
        { name: 'React', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 4 },
        { name: 'Node.js', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 5 },
        { name: 'MongoDB', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 3 },
        { name: 'Docker', category: 'tool', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
        { name: 'REST API', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 5 },
        { name: 'Jest', category: 'tool', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
        { name: 'JavaScript', category: 'technical', proficiencyLevel: 'expert', yearsOfExperience: 6 },
        { name: 'Express', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 5 },
        { name: 'Git', category: 'tool', proficiencyLevel: 'expert', yearsOfExperience: 6 },
        { name: 'Agile', category: 'soft', proficiencyLevel: 'advanced', yearsOfExperience: 4 },
      ],
      experience: [
        { company: 'StartupXYZ', role: 'Full Stack Developer', startDate: new Date('2022-01-01'), isCurrent: true, description: 'Built web apps using React and Node.js for internal tooling', extractedSkills: ['React', 'Node.js', 'TypeScript', 'MongoDB'] },
        { company: 'BigCo', role: 'Software Engineer', startDate: new Date('2019-06-01'), endDate: new Date('2021-12-31'), isCurrent: false, description: 'Worked on backend services and databases for e-commerce platform', extractedSkills: ['Node.js', 'MongoDB', 'Express', 'REST API'] },
        { company: 'DevShop', role: 'Junior Developer', startDate: new Date('2018-01-01'), endDate: new Date('2019-05-31'), isCurrent: false, description: 'Helped deploy applications to the cloud and maintained CI pipelines', extractedSkills: ['JavaScript', 'Docker', 'Git'] },
      ],
      education: [
        { institution: 'Tel Aviv University', degree: 'BSc', fieldOfStudy: 'Computer Science', startDate: new Date('2014-10-01'), endDate: new Date('2018-06-01') },
      ],
      analysisStatus: 'completed',
    });

    console.log('Created seed ProfessionalDNA document!\n');
    console.log(`  ID: ${doc._id}`);
    console.log('\nPaste this ID into the UI at /cv');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
