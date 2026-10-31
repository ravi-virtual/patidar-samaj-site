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
import Faq from '../src/models/Faq';
import HistoryMilestone from '../src/models/HistoryMilestone';
import ImportantLink from '../src/models/ImportantLink';
import MemberProfile from '../src/models/MemberProfile';
import OrganizationSettings from '../src/models/OrganizationSettings';
import User from '../src/models/User';
import { AccountStatus, Roles, config, type Role } from '../src/config/constants';
import { Permissions } from '../src/config/permissions';
import { hashPassword } from '../src/utils/password';

const DAY = 86_400_000;
const inDays = (n: number, hour = 18) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const counts = { created: 0, existing: 0 };
const note = (created: boolean) => (created ? counts.created++ : counts.existing++);

/** Gujarati sample text, keyed by field name (dotted for nested fields, e.g. `items.0.labelGu`). */
type Gu = Record<string, string>;

type Updatable = { updateOne: (filter: object, update: object) => Promise<unknown> };

/**
 * Fills in Gujarati fields that are still empty on a record that already exists, so a database
 * seeded before the portal went bilingual gains its Gujarati sample text. Text an admin has
 * already entered is never overwritten.
 */
async function fillGu(model: Updatable, where: object, gu: Gu) {
  for (const [field, value] of Object.entries(gu)) {
    await model.updateOne(
      { ...where, $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] },
      { $set: { [field]: value } },
    );
  }
}

/** Gujarati text for a new record: flat keys only. Dotted keys (items.0.labelGu) are applied after create by fillGu. */
const guForCreate = (gu: Gu): Gu => Object.fromEntries(Object.entries(gu).filter(([k]) => !k.includes('.')));

/**
 * Creates the document only if nothing matches `where`. Returns the document either way. Empty
 * Gujarati fields (`gu`) are filled in on a new or an existing document, never overwritten.
 */
async function ensure<T extends { _id: string }>(
  model: {
    findOne: (f: object) => { lean: () => Promise<unknown> };
    create: (d: object) => Promise<{ toObject: () => unknown }>;
  } & Updatable,
  where: object,
  data: object,
  gu: Gu = {},
): Promise<T> {
  const found = (await model.findOne(where).lean()) as T | null;
  if (found) {
    note(false);
    await fillGu(model, where, gu);
    return found;
  }
  note(true);
  const created = (await model.create({ ...where, ...data })).toObject() as T;
  await fillGu(model, where, gu);
  return created;
}

const devPassword = () => `Dev-${randomBytes(6).toString('base64url')}-${Math.floor(1000 + Math.random() * 9000)}`;

// A sensible sample selection for the sample admin. The Super Admin always has every permission;
// an admin has exactly the permissions ticked here (members/events/announcements/content day to day).
const SAMPLE_ADMIN_PERMISSIONS = [
  Permissions.DASHBOARD_VIEW,
  Permissions.MEMBERS_READ,
  Permissions.MEMBERS_CREATE,
  Permissions.MEMBERS_UPDATE,
  Permissions.EVENTS_READ,
  Permissions.EVENTS_CREATE,
  Permissions.EVENTS_UPDATE,
  Permissions.EVENTS_PUBLISH,
  Permissions.ANNOUNCEMENTS_READ,
  Permissions.ANNOUNCEMENTS_CREATE,
  Permissions.ANNOUNCEMENTS_UPDATE,
  Permissions.ANNOUNCEMENTS_PUBLISH,
  Permissions.CONTENT_READ,
  Permissions.CONTENT_MANAGE,
  Permissions.MEDIA_UPLOAD,
  Permissions.CONTACTS_READ,
  Permissions.CONTACTS_ASSIGN,
  Permissions.CONTACTS_RESOLVE,
];

async function seedAccounts(resetPasswords: boolean) {
  const people: { role: Role; name: string; email: string; permissions: string[] }[] = [
    { role: Roles.SUPER_ADMIN, name: 'Sample Super Admin', email: 'dev-superadmin@example.test', permissions: [] },
    { role: Roles.ADMIN, name: 'Sample Admin', email: 'dev-admin@example.test', permissions: SAMPLE_ADMIN_PERMISSIONS },
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
      permissions: p.permissions,
      status: AccountStatus.ACTIVE,
      passwordHash: await hashPassword(password),
    });
    note(true);
    users[p.email] = user;
    issued.push({ email: p.email, role: p.role, password });
  }
  return { users, issued };
}

async function seedMembers() {
  const people: [string, string, string, string, string, string, number, string, number][] = [
    ['Rohan Sample', 'Unjha', 'Mehsana', 'India', 'Software engineer', 'public', 2014, 'Runs the youth cricket league.', 4],
    ['Hemaben Sample', 'Visnagar', 'Vadodara', 'India', 'School principal', 'public', 1996, 'Coordinates the Navratri food stalls.', 5],
    ['Nileshbhai Sample', 'Kadi', 'Ahmedabad', 'India', 'Chartered accountant', 'hidden', 1999, 'Keeps the scholarship fund accounts.', 4],
    ['Priya Sample', 'Kalol', 'Leicester', 'United Kingdom', 'Pharmacist', 'public', 2017, 'Organises the UK chapter’s Diwali dinner.', 3],
    ['Kiranbhai Sample', 'Sidhpur', 'Mehsana', 'India', 'Retired engineer', 'hidden', 1988, 'Mentors students on engineering careers.', 2],
    ['Meera Sample', 'Vadnagar', 'Edison, NJ', 'United States', 'Teacher', 'public', 2019, 'Leads the Sunday language class.', 4],
    ['Dineshbhai Sample', 'Kansa', 'Surat', 'India', 'Farmer', 'hidden', 1990, undefined as unknown as string, 6],
    ['Jaya Sample', 'Gozaria', 'Gandhinagar', 'India', 'Doctor', 'hidden', 2005, 'Runs the health-camp volunteers.', 3],
    ['Ashokbhai Sample', 'Ladol', 'Mehsana', 'India', 'Businessman', 'public', 1985, 'Long-time volunteer and committee member.', 5],
    ['Sonal Sample', 'Mehsana', 'Ahmedabad', 'India', 'Architect', 'hidden', 2012, 'Drew the Bhavan extension plans.', 3],
  ];
  for (const [i, [displayName, village, city, country, occupation, visibility, joinedYear, bio, familySize]] of people.entries()) {
    await ensure(MemberProfile, { displayName }, {
      village, city, country, occupation, visibility, joinedYear, bio, familySize,
      membershipStatus: 'active',
      highlighted: i < 6, // the first six appear as home-page highlights
    });
  }
}

async function seedContent(adminId: string) {
  const published = { status: 'published', publishedAt: new Date(), createdBy: adminId, updatedBy: adminId };
  // Every sample record carries its Gujarati text (the *Gu fields) next to the English text.
  const block = (key: ContentKey, data: object, gu: Gu) => ensure(ContentBlock, { key }, { ...published, ...data, ...guForCreate(gu) }, gu);

  await block('home.welcome', { title: 'Welcome to the Samaj portal', body: 'One place for Kadva Patidar families to find each other, plan festivals and stay informed. (Sample text.)' }, {
    titleGu: 'સમાજ પોર્ટલમાં આપનું સ્વાગત છે',
    bodyGu: 'કડવા પાટીદાર પરિવારો એકબીજાને શોધી શકે, તહેવારોનું આયોજન કરી શકે અને માહિતગાર રહી શકે તે માટેનું એક જ સ્થળ. (નમૂના લખાણ.)',
  });
  await block('home.stats', { items: [{ value: '1,000', label: 'Families (sample)' }, { value: '2,500', label: 'Members (sample)' }, { value: '10', label: 'Villages in the directory' }] }, {
    'items.0.labelGu': 'પરિવારો (નમૂનો)',
    'items.1.labelGu': 'સભ્યો (નમૂનો)',
    'items.2.labelGu': 'ડિરેક્ટરીમાં ગામો',
  });
  await block('about.intro', { title: 'About the Samaj', body: 'Sample introduction: a volunteer-run community of Kadva Patidar families with roots in North Gujarat.' }, {
    titleGu: 'સમાજ વિશે',
    bodyGu: 'નમૂના પરિચય: ઉત્તર ગુજરાતમાં મૂળ ધરાવતા કડવા પાટીદાર પરિવારોનો સ્વયંસેવકો દ્વારા ચાલતો સમુદાય.',
  });
  await block('about.mission', { title: 'Mission', body: 'Sample mission: keep families connected across villages and generations.' }, {
    titleGu: 'ધ્યેય',
    bodyGu: 'નમૂના ધ્યેય: ગામો અને પેઢીઓ વચ્ચે પરિવારોને જોડાયેલા રાખવા.',
  });
  await block('about.vision', { title: 'Vision', body: 'Sample vision: one directory, one community, wherever we live.' }, {
    titleGu: 'દૃષ્ટિ',
    bodyGu: 'નમૂના દૃષ્ટિ: એક ડિરેક્ટરી, એક સમાજ, આપણે જ્યાં પણ રહીએ.',
  });
  await block('about.volunteers', { title: 'Run by volunteers', body: 'Sample text about the elected committee and volunteers who organise festivals and keep the directory current.' }, {
    titleGu: 'સ્વયંસેવકો દ્વારા સંચાલિત',
    bodyGu: 'નમૂના લખાણ: ચૂંટાયેલી કમિટી અને સ્વયંસેવકો વિશે, જેઓ તહેવારોનું આયોજન કરે છે અને ડિરેક્ટરી અદ્યતન રાખે છે.',
  });
  await block('about.values', { items: [{ title: 'Seva', text: 'Service without expectation.' }, { title: 'Sanskar', text: 'Passing on language, festivals and values.' }, { title: 'Sangathan', text: 'Unity across villages and continents.' }] }, {
    'items.0.titleGu': 'સેવા',
    'items.0.textGu': 'અપેક્ષા વિનાની સેવા.',
    'items.1.titleGu': 'સંસ્કાર',
    'items.1.textGu': 'ભાષા, તહેવારો અને મૂલ્યોનું સંવર્ધન.',
    'items.2.titleGu': 'સંગઠન',
    'items.2.textGu': 'ગામો અને ખંડો વચ્ચે એકતા.',
  });
  await block('about.achievements', { items: [{ value: '100+', label: 'Scholarships awarded (sample)' }, { value: '300', label: 'Students supported (sample)' }] }, {
    'items.0.labelGu': 'આપેલી શિષ્યવૃત્તિઓ (નમૂનો)',
    'items.1.labelGu': 'સહાય મેળવનાર વિદ્યાર્થીઓ (નમૂનો)',
  });
  await block('about.activities', { items: [{ title: 'Yuva Mandal', text: 'Youth wing: cricket league and mentoring circles.' }, { title: 'Mahila Mandal', text: 'Monthly meet-ups and festival stalls.' }, { title: 'Education Fund', text: 'Scholarships for students from member families.' }] }, {
    'items.0.titleGu': 'યુવા મંડળ',
    'items.0.textGu': 'યુવા પાંખ: ક્રિકેટ લીગ અને માર્ગદર્શન વર્તુળો.',
    'items.1.titleGu': 'મહિલા મંડળ',
    'items.1.textGu': 'માસિક મિલન અને તહેવારોના સ્ટોલ.',
    'items.2.titleGu': 'શિક્ષણ ફંડ',
    'items.2.textGu': 'સભ્ય પરિવારોના વિદ્યાર્થીઓ માટે શિષ્યવૃત્તિ.',
  });
  await block('history.intro', { title: 'From legend to today', body: 'Sample introduction to the community’s history. Replace with sourced text before going live.' }, {
    titleGu: 'દંતકથાથી આજ સુધી',
    bodyGu: 'સમાજના ઇતિહાસનો નમૂના પરિચય. લાઇવ કરતાં પહેલાં સંદર્ભયુક્ત લખાણથી બદલો.',
  });

  const milestones: [string, string, string, string, Gu][] = [
    ['Legend', 'A founding story', 'Sample text: community tradition describes the origin of the Samaj.', 'SAMPLE-001', {
      periodLabelGu: 'દંતકથા', titleGu: 'સ્થાપનાની કથા', textGu: 'નમૂના લખાણ: સમાજની ઉત્પત્તિ વિશે સમુદાયની પરંપરાગત માન્યતા.', sourceRefGu: 'નમૂના-001',
    }],
    ['Roots', 'Farming communities of North Gujarat', 'Sample text: the families’ agricultural roots in the Mehsana district.', 'SAMPLE-002', {
      periodLabelGu: 'મૂળ', titleGu: 'ઉત્તર ગુજરાતના ખેડૂત સમુદાયો', textGu: 'નમૂના લખાણ: મહેસાણા જિલ્લામાં પરિવારોના ખેતીવાડીના મૂળ.', sourceRefGu: 'નમૂના-002',
    }],
    ['1950s', 'First village committees', 'Sample text: informal committees begin to organise festivals.', 'SAMPLE-003', {
      periodLabelGu: '૧૯૫૦નો દાયકો', titleGu: 'પ્રથમ ગામ સમિતિઓ', textGu: 'નમૂના લખાણ: તહેવારોના આયોજન માટે અનૌપચારિક સમિતિઓની શરૂઆત.', sourceRefGu: 'નમૂના-003',
    }],
    ['1990s', 'A shared directory begins', 'Sample text: the first printed directory of families.', 'SAMPLE-004', {
      periodLabelGu: '૧૯૯૦નો દાયકો', titleGu: 'સહિયારી ડિરેક્ટરીની શરૂઆત', textGu: 'નમૂના લખાણ: પરિવારોની પ્રથમ છપાયેલી ડિરેક્ટરી.', sourceRefGu: 'નમૂના-004',
    }],
    ['Today', 'A community portal', 'Sample text: this website replaces the printed directory.', 'SAMPLE-005', {
      periodLabelGu: 'આજે', titleGu: 'સમાજ પોર્ટલ', textGu: 'નમૂના લખાણ: આ વેબસાઇટ છપાયેલી ડિરેક્ટરીનું સ્થાન લે છે.', sourceRefGu: 'નમૂના-005',
    }],
  ];
  for (const [i, [periodLabel, title, text, sourceRef, gu]] of milestones.entries()) {
    await ensure(HistoryMilestone, { title }, { ...published, periodLabel, text, sourceRef, order: i, ...gu }, gu);
  }

  const term = await ensure<{ _id: string }>(CommitteeTerm, { label: '2025–2027' }, { ...published, startYear: 2025, endYear: 2027, isCurrent: true });
  const roles: [string, string, string, string][] = [
    ['Ashok Sample', 'President', 'અશોક નમૂનો', 'પ્રમુખ'],
    ['Hema Sample', 'Vice President', 'હેમા નમૂનો', 'ઉપપ્રમુખ'],
    ['Nilesh Sample', 'Treasurer', 'નિલેશ નમૂનો', 'ખજાનચી'],
    ['Jaya Sample', 'Secretary', 'જયા નમૂનો', 'મંત્રી'],
    ['Rohan Sample', 'Youth Coordinator', 'રોહન નમૂનો', 'યુવા સંયોજક'],
  ];
  for (const [i, [name, position, nameGu, positionGu]] of roles.entries()) {
    const gu = { nameGu, positionGu, bioGu: 'નમૂના પરિચય.' };
    await ensure(CommitteeMember, { termId: term._id, name }, { ...published, position, order: i, bio: 'Sample biography.', ...gu }, gu);
  }

  const faqs: [string, string, string, string][] = [
    ['Who can become a member?', 'Any Kadva Patidar family with roots in North Gujarat. Contact the Samaj office to be listed in the directory. (Sample answer.)',
      'સભ્ય કોણ બની શકે?', 'ઉત્તર ગુજરાતમાં મૂળ ધરાવતો કોઈપણ કડવા પાટીદાર પરિવાર. ડિરેક્ટરીમાં નામ નોંધાવવા સમાજ કચેરીનો સંપર્ક કરો. (નમૂના જવાબ.)'],
    ['Who can see my phone number and email?', 'Only the office. The public directory shows a name, village and city, and only for entries marked public. (Sample answer.)',
      'મારો ફોન નંબર અને ઇમેઇલ કોણ જોઈ શકે?', 'ફક્ત કચેરી. જાહેર ડિરેક્ટરીમાં માત્ર નામ, ગામ અને શહેર દેખાય છે, અને તે પણ ફક્ત જાહેર તરીકે ચિહ્નિત નોંધણીઓ માટે. (નમૂના જવાબ.)'],
    ['Where can I find upcoming events?', 'Open the Events page for dates, venues and details. (Sample answer.)',
      'આગામી કાર્યક્રમો ક્યાં જોવા મળશે?', 'તારીખો, સ્થળ અને વિગતો માટે કાર્યક્રમો પેજ ખોલો. (નમૂના જવાબ.)'],
  ];
  for (const [i, [question, answer, questionGu, answerGu]] of faqs.entries()) {
    await ensure(Faq, { question }, { ...published, answer, order: i, questionGu, answerGu }, { questionGu, answerGu });
  }

  const links: [string, string, string, string][] = [
    ['Membership application form', 'https://example.org/forms/membership.pdf', 'Forms', 'સભ્યપદ અરજી ફોર્મ'],
    ['Scholarship application', 'https://example.org/forms/scholarship.pdf', 'Forms', 'શિષ્યવૃત્તિ અરજી'],
    ['Bhavan booking request', 'https://example.org/forms/booking.pdf', 'Services', 'ભવન બુકિંગ વિનંતી'],
  ];
  for (const [i, [label, url, category, labelGu]] of links.entries()) {
    await ensure(ImportantLink, { label }, { ...published, url, category, order: i, labelGu }, { labelGu });
  }

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
  // The settings document exists by now (new or old), so its empty Gujarati fields are filled in.
  await fillGu(OrganizationSettings, { key: 'main' }, {
    nameGu: 'ઉત્તર ગુજરાત કડવા પાટીદાર સમાજ',
    shortNameGu: 'કડવા પાટીદાર સમાજ',
    invocationGu: 'જય ઉમિયા માતા',
    taglineGu: 'જ્યાં પણ રહીએ, મા ઉમિયાનો એક પરિવાર',
    footerNoteGu: 'વિકાસ માટેનો નમૂના ડેટા. કોઈ સાચી સંસ્થાનો રેકોર્ડ નથી.',
    'contact.addressGu': 'નમૂના કચેરી, ઊંઝા, મહેસાણા જિલ્લો',
    'contact.officeHoursGu': 'સોમ–શનિ, સવારે ૧૦:૦૦ થી સાંજે ૬:૦૦',
  });
}

async function seedEvents(adminId: string) {
  const base = { status: 'published', createdBy: adminId, updatedBy: adminId, publishedAt: new Date() };
  const events: [string, string, number, number, string, boolean, string, string][] = [
    ['Sample Sharad Purnima Raas', 'Festival', 4, 19, 'Samaj Bhavan lawns', true, 'નમૂના શરદ પૂર્ણિમા રાસ', 'સમાજ ભવનનાં લૉન'],
    ['Sample Diwali Dinner', 'Festival', 12, 19, 'Samaj Bhavan main hall', false, 'નમૂના દિવાળી સ્નેહભોજન', 'સમાજ ભવનનો મુખ્ય હોલ'],
    ['Sample New Year Sneh Milan', 'Family', 14, 10, 'Samaj Bhavan main hall', false, 'નમૂના નૂતન વર્ષ સ્નેહ મિલન', 'સમાજ ભવનનો મુખ્ય હોલ'],
    ['Sample Blood Donation Camp', 'Seva', 26, 9, 'Samaj Bhavan ground floor', false, 'નમૂના રક્તદાન શિબિર', 'સમાજ ભવનનો ભોંયતળિયાનો ભાગ'],
    ['Sample Scholarship Ceremony', 'Education', 40, 11, 'Town Hall, Mehsana', false, 'નમૂના શિષ્યવૃત્તિ સમારોહ', 'ટાઉન હૉલ, મહેસાણા'],
  ];
  for (const [title, category, days, hour, venue, featured, titleGu, venueGu] of events) {
    const gu = { titleGu, venueGu, descriptionGu: 'નમૂના કાર્યક્રમ. લાઇવ કરતાં પહેલાં સાચી વિગતો સાથે બદલો.' };
    await ensure(Event, { title }, {
      ...base, category, startsAt: inDays(days, hour), venue, featured,
      description: 'Sample event for development. Replace with real details before going live.',
      ...gu,
    }, gu);
  }
  const draftGu = { titleGu: 'નમૂના ડ્રાફ્ટ કાર્યક્રમ (જાહેર નથી)', venueGu: 'હજુ નક્કી થયું નથી' };
  await ensure(Event, { title: 'Sample Draft Event (not public)' }, {
    status: 'draft', createdBy: adminId, category: 'Meeting', startsAt: inDays(60), venue: 'To be decided', ...draftGu,
  }, draftGu);

  const news: [string, string, string, boolean, string, string][] = [
    ['Sample: Diwali Dinner details announced', 'Event', 'Join us at the Samaj Bhavan main hall. (Sample announcement.)', true,
      'નમૂના: દિવાળી સ્નેહભોજનની વિગતો જાહેર', 'સમાજ ભવનના મુખ્ય હોલમાં અમારી સાથે જોડાઓ. (નમૂના જાહેરાત.)'],
    ['Sample: Scholarship results announced', 'Education', 'Recipients have been informed. (Sample announcement.)', false,
      'નમૂના: શિષ્યવૃત્તિનાં પરિણામો જાહેર', 'પ્રાપ્તકર્તાઓને જાણ કરવામાં આવી છે. (નમૂના જાહેરાત.)'],
    ['Sample: Membership renewals open', 'Notice', 'Renew at the Samaj office. (Sample announcement.)', false,
      'નમૂના: સભ્યપદ નવીનીકરણ શરૂ', 'સમાજ કચેરીમાં નવીનીકરણ કરાવો. (નમૂના જાહેરાત.)'],
  ];
  for (const [i, [title, category, body, pinned, titleGu, bodyGu]] of news.entries()) {
    await ensure(Announcement, { title }, {
      category, body, pinned, status: 'published', order: i, createdBy: adminId,
      publishedAt: new Date(), publishAt: inDays(-(i + 1)), titleGu, bodyGu,
    }, { titleGu, bodyGu });
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
  await seedMembers();
  await seedContent(users['dev-admin@example.test']!._id);
  await seedEvents(users['dev-admin@example.test']!._id);

  console.log(`\nDone: ${counts.created} created, ${counts.existing} already present (left unchanged).`);
  if (issued.length) {
    console.log('\nSample accounts (Super Admin and Admin) — DEVELOPMENT ONLY. These passwords are shown once and are not stored anywhere:');
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
