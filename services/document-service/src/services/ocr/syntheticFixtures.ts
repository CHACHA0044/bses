import { DocumentType } from '@prisma/client';
import { makeValidAadhaar } from './verhoeff';

/**
 * Synthetic Document Fixture Generator
 *
 * Generates non-sensitive test fixtures for OCR benchmarking.
 * NEVER uses real Aadhaar/PAN/DL data. All values are synthetic.
 */

export interface SyntheticField {
  key: string;
  value: string;
  label?: string;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface SyntheticFixture {
  id: string;
  docType: DocumentType;
  fields: SyntheticField[];
  scenario: string;
  hasQr: boolean;
  qrFormat?: string | undefined;
  aadhaarValid?: boolean | undefined;
}

function generateValidAadhaar(): string {
  // Use the canonical Verhoeff implementation to generate valid check digits.
  let prefix = String(2 + Math.floor(Math.random() * 8));
  for (let i = 0; i < 10; i++) prefix += Math.floor(Math.random() * 10);
  return makeValidAadhaar(prefix);
}

function generateValidPan(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const cats = ['P','C','H','F','A','T','B','L','J','G'];
  let pan = '';
  for (let i = 0; i < 3; i++) pan += letters[Math.floor(Math.random() * 26)];
  pan += cats[Math.floor(Math.random() * cats.length)];
  pan += letters[Math.floor(Math.random() * 26)];
  for (let i = 0; i < 4; i++) pan += Math.floor(Math.random() * 10);
  pan += letters[Math.floor(Math.random() * 26)];
  return pan;
}

function generateValidDl(): string {
  const states = ['UP','DL','MH','KA','TN','RJ','MP','GJ','WB','PB'];
  const state = states[Math.floor(Math.random() * states.length)] ?? 'UP';
  let dl = state;
  dl += String(1 + Math.floor(Math.random() * 9)) + Math.floor(Math.random() * 10);
  dl += ' ';
  for (let i = 0; i < 12; i++) dl += Math.floor(Math.random() * 10);
  return dl;
}

const NAMES = [
  'ARUN KUMAR','PRIYA SHARMA','RAHUL VERMA','SNEHA PATEL',
  'VIKRAM SINGH','ANANYA REDDY','KARTHIK IYER','MEERA NAIR',
];
const FATHERS = [
  'RAM KUMAR','MOHAN SHARMA','SURESH VERMA','KARSANBHAI PATEL',
  'RAJENDRA SINGH','VENKAT REDDY','SUNDARAM IYER','KRISHNAN NAIR',
];
const ADDRS = [
  { line: 'HOUSE 42, MG ROAD', city: 'BANGALORE', state: 'KARNATAKA', pin: '560001' },
  { line: 'FLAT 12, SECTOR 7', city: 'NOIDA', state: 'UTTAR PRADESH', pin: '201301' },
  { line: '14, JUHU LANE', city: 'MUMBAI', state: 'MAHARTRA', pin: '400049' },
  { line: '7, ANNA NAGAR', city: 'CHENNAI', state: 'TAMIL NADU', pin: '600040' },
];

function randomDate(sy: number, ey: number): string {
  const y = sy + Math.floor(Math.random() * (ey - sy));
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
}

const generateAadhaarFields = (scenario: string): SyntheticField[] => {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)] ?? 'ARUN KUMAR';
  const dob = randomDate(1960, 2005);
  const gender = Math.random() > 0.5 ? 'Male' : 'Female';
  const aadhaar = generateValidAadhaar();
  const addr = ADDRS[Math.floor(Math.random() * ADDRS.length)] ?? ADDRS[0]!;
  return [
    { key: 'name', value: name, label: 'Name' },
    { key: 'dob', value: dob, label: 'DOB' },
    { key: 'gender', value: gender, label: 'Male/Female' },
    { key: 'aadhaar', value: aadhaar, label: 'Aadhaar' },
    { key: 'address', value: `${addr.line}, ${addr.city}`, label: 'Address' },
    { key: 'pin', value: addr.pin, label: 'PIN' },
    { key: 'state', value: addr.state, label: 'State' },
  ].map((f, i) => ({ ...f, bbox: { x: 50, y: 150 + i * 45, w: 400, h: 35 } }));
};

const generatePanFields = (scenario: string): SyntheticField[] => {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)] ?? 'PRIYA SHARMA';
  const father = FATHERS[Math.floor(Math.random() * FATHERS.length)] ?? 'RAM KUMAR';
  const dob = randomDate(1950, 2005);
  const pan = generateValidPan();
  return [
    { key: 'name', value: name, label: 'Name' },
    { key: 'fatherName', value: father, label: "Father's Name" },
    { key: 'dob', value: dob, label: 'Date of Birth' },
    { key: 'pan', value: pan, label: 'PAN' },
  ].map((f, i) => ({ ...f, bbox: { x: 60, y: 200 + i * 50, w: 380, h: 40 } }));
};

const generateDlFields = (scenario: string): SyntheticField[] => {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)] ?? 'RAHUL VERMA';
  const swd = FATHERS[Math.floor(Math.random() * FATHERS.length)] ?? 'SURESH VERMA';
  const dob = randomDate(1960, 2006);
  const issueDate = randomDate(2010, 2024);
  const expiryDate = '2030-12-31';
  const dl = generateValidDl();
  const addr = ADDRS[Math.floor(Math.random() * ADDRS.length)] ?? ADDRS[0]!;
  return [
    { key: 'name', value: name, label: 'Name' },
    { key: 'dob', value: dob, label: 'DOB' },
    { key: 'fatherName', value: `S/O ${swd}`, label: 'S/W/D' },
    { key: 'licence', value: dl, label: 'Licence No' },
    { key: 'issueDate', value: issueDate, label: 'Issue Date' },
    { key: 'expiryDate', value: expiryDate, label: 'Expiry Date' },
    { key: 'address', value: `${addr.line}, ${addr.city}, ${addr.state}`, label: 'Address' },
    { key: 'pin', value: addr.pin, label: 'PIN' },
  ].map((f, i) => ({ ...f, bbox: { x: 55, y: 180 + i * 42, w: 420, h: 38 } }));
};

export const generateAadhaarFixture = (scenario = 'clean'): SyntheticFixture => ({
  id: `aadhaar-${scenario}`,
  docType: 'AADHAAR_CARD' as DocumentType,
  fields: generateAadhaarFields(scenario),
  scenario,
  hasQr: scenario !== 'no_qr',
  qrFormat: scenario !== 'no_qr' ? 'aadhaar-offline' : undefined,
  aadhaarValid: true,
});

export const generatePanFixture = (scenario = 'clean'): SyntheticFixture => ({
  id: `pan-${scenario}`,
  docType: 'PAN_CARD' as DocumentType,
  fields: generatePanFields(scenario),
  scenario,
  hasQr: false,
});

export const generateDlFixture = (scenario = 'clean'): SyntheticFixture => ({
  id: `dl-${scenario}`,
  docType: 'DRIVING_LICENSE' as DocumentType,
  fields: generateDlFields(scenario),
  scenario,
  hasQr: false,
});

export const SCENARIOS = [
  'clean', 'phone_camera', 'low_light', 'glare', 'blur',
  'perspective', 'rotation', 'low_res', 'hindi', 'mixed',
  'cropped', 'no_qr', 'damaged_qr',
];