// Development sample data. FICTIONAL people, addresses and numbers: none of it is real.
//
//   1. In backend/.env set  ENABLE_DEV_SEED=true  (refused when NODE_ENV=production)
//   2. npm run seed                       adds anything that is missing, changes nothing else
//      npm run seed -- --reset-passwords  also gives the sample accounts new random passwords
//
// Safe to run repeatedly: every record is looked up by a natural key (email, title, label) and
// only created when missing, so running it twice never duplicates data and never overwrites edits.
// It never deletes anything and it is never run automatically at startup.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import Announcement from '../src/models/Announcement';
import CommitteeMember from '../src/models/CommitteeMember';
import CommitteeTerm from '../src/models/CommitteeTerm';
import ContentBlock, { type ContentKey } from '../src/models/ContentBlock';
import Event from '../src/models/Event';
import EventRegistration from '../src/models/EventRegistration';
import Faq from '../src/models/Faq';
import HistoryMilestone from '../src/models/HistoryMilestone';
import ImportantLink from '../src/models/ImportantLink';
import MemberProfile from '../src/models/MemberProfile';
import OrganizationSettings from '../src/models/OrganizationSettings';
import User from '../src/models/User';
import { AccountStatus, Roles, config, type Role } from '../src/config/constants';
import { hashPassword } from '../src/utils/password';

const DAY = 86_400_000;
const inDays = (n: number, hour = 18) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const counts = { created: 0, existing: 0 };
const note = (created: boolean) => (created ? counts.created++ : counts.existing++);

/** Creates the document only if nothing matches `where`. Returns the document either way. */
async function ensure<T extends { _id: string }>(
  model: { findOne: (f: object) => { lean: () => Promise<unknown> }; create: (d: object) => Promise<{ toObject: () => unknown }> },
  where: object,
  data: object,
): Promise<T> {
  const found = (await model.findOne(where).lean()) as T | null;
  if (found) {
    note(false);
    return found;
  }
  note(true);
  return (await model.create({ ...where, ...data })).toObject() as T;
}

const devPassword = () => `Dev-${randomBytes(6).toString('base64url')}-${Math.floor(1000 + Math.random() * 9000)}`;

async function seedAccounts(resetPasswords: boolean) {
  const people: { role: Role; name: string; email: string }[] = [
    { role: Roles.SUPER_ADMIN, name: 'Sample Super Admin', email: 'dev-superadmin@example.test' },
    { role: Roles.ADMIN, name: 'Sample Admin', email: 'dev-admin@example.test' },
    { role: Roles.EDITOR, name: 'Sample Editor', email: 'dev-editor@example.test' },
    { role: Roles.VIEWER, name: 'Sample Viewer', email: 'dev-viewer@example.test' },
    { role: Roles.MEMBER, name: 'Sample Member', email: 'dev-member@example.test' },
  ];
  const issued: { email: string; role: string; password: string }[] = [];
  const users: Record<string, { _id: string }> = {};

  for (const p of people) {
    const existing = await User.findOne({ email: p.email }).select('+passwordHash');
    if (existing) {
      note(false);
      users[p.email] = existing;
      if (resetPasswords) {
        const password = devPassword();
        existing.passwordHash = await hashPassword(password);
        existing.status = AccountStatus.ACTIVE;
        existing.failedLoginCount = 0;
        existing.lockUntil = undefined;
        await existing.save();
        issued.push({ email: p.email, role: p.role, password });
      }
      continue;
    }
    const password = devPassword();
    const user = await User.create({
      name: p.name,
      email: p.email,
      role: p.role,
      status: AccountStatus.ACTIVE,
      passwordHash: await hashPassword(password),
      approvedAt: new Date(),
    });
    note(true);
    users[p.email] = user;
    issued.push({ email: p.email, role: p.role, password });
  }
  return { users, issued };
}

async function seedMembers(sampleMemberId: string) {
  const people: [string, string, string, string, string, string, number, string, number][] = [
    ['Rohan Sample', 'Unjha', 'Mehsana', 'India', 'Software engineer', 'public', 2014, 'Runs the youth cricket league.', 4],
    ['Hemaben Sample', 'Visnagar', 'Vadodara', 'India', 'School principal', 'public', 1996, 'Coordinates the Navratri food stalls.', 5],
    ['Nileshbhai Sample', 'Kadi', 'Ahmedabad', 'India', 'Chartered accountant', 'members', 1999, 'Keeps the scholarship fund accounts.', 4],
    ['Priya Sample', 'Kalol', 'Leicester', 'United Kingdom', 'Pharmacist', 'public', 2017, 'Organises the UK chapter’s Diwali dinner.', 3],
    ['Kiranbhai Sample', 'Sidhpur', 'Mehsana', 'India', 'Retired engineer', 'members', 1988, 'Mentors students on engineering careers.', 2],
    ['Meera Sample', 'Vadnagar', 'Edison, NJ', 'United States', 'Teacher', 'public', 2019, 'Leads the Sunday language class.', 4],
    ['Dineshbhai Sample', 'Kansa', 'Surat', 'India', 'Farmer', 'hidden', 1990, undefined as unknown as string, 6],
    ['Jaya Sample', 'Gozaria', 'Gandhinagar', 'India', 'Doctor', 'members', 2005, 'Runs the health-camp volunteers.', 3],
    ['Ashokbhai Sample', 'Ladol', 'Mehsana', 'India', 'Businessman', 'public', 1985, 'Long-time volunteer and committee member.', 5],
    ['Sonal Sample', 'Mehsana', 'Ahmedabad', 'India', 'Architect', 'members', 2012, 'Drew the Bhavan extension plans.', 3],
  ];
  for (const [i, [displayName, village, city, country, occupation, visibility, joinedYear, bio, familySize]] of people.entries()) {
    await ensure(MemberProfile, { displayName }, {
      userId: null,
      village, city, country, occupation, visibility, joinedYear, bio, familySize,
      membershipStatus: 'active',
      highlighted: i < 6, // the first six appear as home-page highlights
    });
  }
  // The sample member account has its own directory entry.
  const own = await MemberProfile.findOne({ userId: sampleMemberId }).lean();
  if (!own) {
    await MemberProfile.create({
      userId: sampleMemberId, displayName: 'Sample Member', village: 'Unjha', city: 'Mehsana', country: 'India',
      membershipStatus: 'active', visibility: 'members', joinedYear: new Date().getFullYear(),
    });
    note(true);
  } else note(false);

  // One registration waiting for approval, so the approval queue has something in it.
  const pendingEmail = 'dev-pending@example.test';
  let pending = await User.findOne({ email: pendingEmail });
  if (!pending) {
    pending = await User.create({
      name: 'Pending Applicant', email: pendingEmail, role: Roles.MEMBER, status: AccountStatus.PENDING,
      passwordHash: await hashPassword(devPassword()), membershipAcknowledgedAt: new Date(),
    });
    await MemberProfile.create({ userId: pending._id, displayName: 'Pending Applicant', membershipStatus: 'pending' });
    note(true);
  } else note(false);
}

async function seedContent(adminId: string) {
  const published = { status: 'published', publishedAt: new Date(), createdBy: adminId, updatedBy: adminId };
  const block = (key: ContentKey, data: object) => ensure(ContentBlock, { key }, { ...published, ...data });

  await block('home.welcome', { title: 'Welcome to the Samaj portal', body: 'One place for Kadva Patidar families to find each other, plan festivals and stay informed. (Sample text.)' });
  await block('home.stats', { items: [{ value: '1,000', label: 'Families (sample)' }, { value: '2,500', label: 'Members (sample)' }, { value: '10', label: 'Villages in the directory' }] });
  await block('about.intro', { title: 'About the Samaj', body: 'Sample introduction: a volunteer-run community of Kadva Patidar families with roots in North Gujarat.' });
  await block('about.mission', { title: 'Mission', body: 'Sample mission: keep families connected across villages and generations.' });
  await block('about.vision', { title: 'Vision', body: 'Sample vision: one directory, one community, wherever we live.' });
  await block('about.volunteers', { title: 'Run by volunteers', body: 'Sample text about the elected committee and volunteers who organise festivals and keep the directory current.' });
  await block('about.values', { items: [{ title: 'Seva', text: 'Service without expectation.' }, { title: 'Sanskar', text: 'Passing on language, festivals and values.' }, { title: 'Sangathan', text: 'Unity across villages and continents.' }] });
  await block('about.achievements', { items: [{ value: '100+', label: 'Scholarships awarded (sample)' }, { value: '300', label: 'Students supported (sample)' }] });
  await block('about.activities', { items: [{ title: 'Yuva Mandal', text: 'Youth wing: cricket league and mentoring circles.' }, { title: 'Mahila Mandal', text: 'Monthly meet-ups and festival stalls.' }, { title: 'Education Fund', text: 'Scholarships for students from member families.' }] });
  await block('history.intro', { title: 'From legend to today', body: 'Sample introduction to the community’s history. Replace with sourced text before going live.' });

  const milestones: [string, string, string, string][] = [
    ['Legend', 'A founding story', 'Sample text: community tradition describes the origin of the Samaj.', 'SAMPLE-001'],
    ['Roots', 'Farming communities of North Gujarat', 'Sample text: the families’ agricultural roots in the Mehsana district.', 'SAMPLE-002'],
    ['1950s', 'First village committees', 'Sample text: informal committees begin to organise festivals.', 'SAMPLE-003'],
    ['1990s', 'A shared directory begins', 'Sample text: the first printed directory of families.', 'SAMPLE-004'],
    ['Today', 'A community portal', 'Sample text: this website replaces the printed directory.', 'SAMPLE-005'],
  ];
  for (const [i, [periodLabel, title, text, sourceRef]] of milestones.entries()) {
    await ensure(HistoryMilestone, { title }, { ...published, periodLabel, text, sourceRef, order: i });
  }

  const term = await ensure<{ _id: string }>(CommitteeTerm, { label: '2025–2027' }, { ...published, startYear: 2025, endYear: 2027, isCurrent: true });
  const roles: [string, string][] = [['Ashok Sample', 'President'], ['Hema Sample', 'Vice President'], ['Nilesh Sample', 'Treasurer'], ['Jaya Sample', 'Secretary'], ['Rohan Sample', 'Youth Coordinator']];
  for (const [i, [name, position]] of roles.entries()) {
    await ensure(CommitteeMember, { termId: term._id, name }, { ...published, position, order: i, bio: 'Sample biography.' });
  }

  const faqs: [string, string][] = [
    ['Who can become a member?', 'Any Kadva Patidar family with roots in North Gujarat can apply. An admin reviews every application. (Sample answer.)'],
    ['Who can see my phone number and email?', 'Only the Super Admin. Other members see your name, village and city, and only if you allow it. (Sample answer.)'],
    ['How do I RSVP to an event?', 'Sign in, open the event and choose RSVP. Your events appear on your dashboard. (Sample answer.)'],
  ];
  for (const [i, [question, answer]] of faqs.entries()) await ensure(Faq, { question }, { ...published, answer, order: i });

  const links: [string, string, string][] = [
    ['Membership application form', 'https://example.org/forms/membership.pdf', 'Forms'],
    ['Scholarship application', 'https://example.org/forms/scholarship.pdf', 'Forms'],
    ['Bhavan booking request', 'https://example.org/forms/booking.pdf', 'Services'],
  ];
  for (const [i, [label, url, category]] of links.entries()) await ensure(ImportantLink, { label }, { ...published, url, category, order: i });

  await OrganizationSettings.updateOne(
    { key: 'main' },
    {
      $setOnInsert: {
        key: 'main',
        tagline: 'One family of Maa Umiya, wherever we live',
        contact: { email: 'office@example.org', phone: '+91 00000 00000', address: 'Sample office, Unjha, Mehsana district', officeHours: 'Mon–Sat, 10:00–18:00' },
        footerNote: 'Sample data for development. Not a real organisation record.',
      },
    },
    { upsert: true },
  );
}

async function seedEvents(adminId: string, memberId: string) {
  const base = { status: 'published', createdBy: adminId, updatedBy: adminId, publishedAt: new Date() };
  const events: [string, string, number, number, string, number, boolean][] = [
    ['Sample Sharad Purnima Raas', 'Festival', 4, 19, 'Samaj Bhavan lawns', 400, true],
    ['Sample Diwali Dinner', 'Festival', 12, 19, 'Samaj Bhavan main hall', 600, false],
    ['Sample New Year Sneh Milan', 'Family', 14, 10, 'Samaj Bhavan main hall', 0, false],
    ['Sample Blood Donation Camp', 'Seva', 26, 9, 'Samaj Bhavan ground floor', 150, false],
    ['Sample Scholarship Ceremony', 'Education', 40, 11, 'Town Hall, Mehsana', 300, false],
  ];
  for (const [title, category, days, hour, venue, capacity, featured] of events) {
    await ensure(Event, { title }, {
      ...base, category, startsAt: inDays(days, hour), venue, capacity, featured,
      description: 'Sample event for development. Replace with real details before going live.',
    });
  }
  await ensure(Event, { title: 'Sample Draft Event (not public)' }, {
    status: 'draft', createdBy: adminId, category: 'Meeting', startsAt: inDays(60), venue: 'To be decided', capacity: 50,
  });

  // A registration for the sample member, then recount so registeredCount always matches reality.
  const first = await Event.findOne({ title: 'Sample Sharad Purnima Raas' }).lean();
  if (first) {
    const reg = await EventRegistration.findOne({ eventId: first._id, userId: memberId }).lean();
    if (!reg) {
      await EventRegistration.create({ eventId: first._id, userId: memberId, attendees: 3 });
      note(true);
    } else note(false);
  }
  for (const e of await Event.find({ isDeleted: false }).lean()) {
    const agg = await EventRegistration.aggregate<{ n: number }>([
      { $match: { eventId: e._id, status: 'confirmed' } },
      { $group: { _id: null, n: { $sum: '$attendees' } } },
    ]);
    await Event.updateOne({ _id: e._id }, { $set: { registeredCount: agg[0]?.n ?? 0 } });
  }

  const news: [string, string, string, boolean][] = [
    ['Sample: Diwali Dinner registrations are open', 'Event', 'Register every family member attending. (Sample announcement.)', true],
    ['Sample: Scholarship results announced', 'Education', 'Recipients have been informed. (Sample announcement.)', false],
    ['Sample: Membership renewals open', 'Notice', 'Renew from your profile or at the office. (Sample announcement.)', false],
  ];
  for (const [i, [title, category, body, pinned]] of news.entries()) {
    await ensure(Announcement, { title }, {
      category, body, pinned, status: 'published', order: i, createdBy: adminId,
      publishedAt: new Date(), publishAt: inDays(-(i + 1)),
    });
  }
}

async function run() {
  if (config.isProduction || !config.devSeedEnabled) {
    console.error('Seeding is disabled. It is development-only.');
    console.error('Set ENABLE_DEV_SEED=true in backend/.env (and make sure NODE_ENV is not "production").');
    process.exit(1);
  }

  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const target = new URL(config.mongo.uri);
  console.log(`Seeding ${target.host}${target.pathname} (development only)...`);

  const reset = process.argv.includes('--reset-passwords');
  const { users, issued } = await seedAccounts(reset);
  await seedMembers(users['dev-member@example.test']!._id);
  await seedContent(users['dev-admin@example.test']!._id);
  await seedEvents(users['dev-admin@example.test']!._id, users['dev-member@example.test']!._id);

  console.log(`\nDone: ${counts.created} created, ${counts.existing} already present (left unchanged).`);
  if (issued.length) {
    console.log('\nSample accounts — DEVELOPMENT ONLY. These passwords are shown once and are not stored anywhere:');
    for (const a of issued) console.log(`  ${a.role.padEnd(10)} ${a.email.padEnd(32)} ${a.password}`);
  } else {
    console.log('\nSample accounts already exist, so their passwords were not changed.');
    console.log('Run  npm run seed -- --reset-passwords  to issue new ones.');
  }
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error('Seeding failed:', err instanceof Error ? err.message : err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
