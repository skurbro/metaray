// Device catalog. Lens strings follow the format phones themselves write into EXIF.
// cams: [key, focal length (mm), f-number, 35mm equivalent]
// Apple 17-series and most Android lens values are approximations.

const IOS_ALL = ['15.8.3', '16.7.10', '17.0', '17.4.1', '17.6.1', '18.0', '18.1.1', '18.3.2', '18.5', '18.6.2', '26.0', '26.0.1', '26.1', '26.2', '26.3', '26.4', '26.5', '26.5.2'];
const iosFrom = (min, max = '26.5.2') => IOS_ALL.filter((v) => cmp(v, min) >= 0 && cmp(v, max) <= 0);
function cmp(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

export const CAM_LABEL = { main: 'Main', ultra: 'Ultra Wide', tele: 'Telephoto', front: 'Front' };

function apple(model, year, kind, cams, os) {
  // kind is Apple's own name for the module: "back camera", "back dual wide camera", "back triple camera"
  const out = {};
  for (const [key, fl, f, f35] of cams) {
    const where = key === 'front' ? 'front camera' : kind;
    out[key] = { lensModel: `${model} ${where} ${fl}mm f/${f}`, focalLength: fl, fNumber: f, focal35: f35 };
  }
  return { brand: 'Apple', make: 'Apple', model, name: model, year, os: 'ios', software: os, lensMake: 'Apple', cams: out };
}

function android(brand, make, model, name, year, cams, software, android) {
  const out = {};
  for (const [key, fl, f, f35] of cams) out[key] = { lensModel: '', focalLength: fl, fNumber: f, focal35: f35 };
  return { brand, make, model, name, year, os: 'android', software, android, lensMake: '', cams: out };
}

const F_OLD = ['front', 2.71, 2.2, 23];
const F_NEW = ['front', 2.69, 1.9, 23];

export const DEVICES = [
  apple('iPhone 17 Pro Max', 2025, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 12.43, 2.8, 100], F_NEW], iosFrom('26.0')),
  apple('iPhone 17 Pro', 2025, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 12.43, 2.8, 100], F_NEW], iosFrom('26.0')),
  apple('iPhone Air', 2025, 'back camera', [['main', 5.96, 1.6, 26], F_NEW], iosFrom('26.0')),
  apple('iPhone 17', 2025, 'back dual wide camera', [['main', 5.96, 1.6, 26], ['ultra', 2.22, 2.2, 13], F_NEW], iosFrom('26.0')),
  apple('iPhone 16 Pro Max', 2024, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 15.66, 2.8, 120], F_NEW], iosFrom('18.0')),
  apple('iPhone 16 Pro', 2024, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 15.66, 2.8, 120], F_NEW], iosFrom('18.0')),
  apple('iPhone 16 Plus', 2024, 'back dual wide camera', [['main', 5.96, 1.6, 26], ['ultra', 1.54, 2.2, 13], F_NEW], iosFrom('18.0')),
  apple('iPhone 16', 2024, 'back dual wide camera', [['main', 5.96, 1.6, 26], ['ultra', 1.54, 2.2, 13], F_NEW], iosFrom('18.0')),
  apple('iPhone 16e', 2025, 'back camera', [['main', 5.96, 1.6, 26], F_NEW], iosFrom('18.3.2')),
  apple('iPhone 15 Pro Max', 2023, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 15.66, 2.8, 120], F_NEW], iosFrom('17.0')),
  apple('iPhone 15 Pro', 2023, 'back triple camera', [['main', 6.765, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 9, 2.8, 77], F_NEW], iosFrom('17.0')),
  apple('iPhone 15 Plus', 2023, 'back dual wide camera', [['main', 6.06, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_NEW], iosFrom('17.0')),
  apple('iPhone 15', 2023, 'back dual wide camera', [['main', 6.06, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_NEW], iosFrom('17.0')),
  apple('iPhone 14 Pro Max', 2022, 'back triple camera', [['main', 6.86, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 9, 2.8, 77], F_NEW], iosFrom('16.7.10')),
  apple('iPhone 14 Pro', 2022, 'back triple camera', [['main', 6.86, 1.78, 24], ['ultra', 2.22, 2.2, 13], ['tele', 9, 2.8, 77], F_NEW], iosFrom('16.7.10')),
  apple('iPhone 14 Plus', 2022, 'back dual wide camera', [['main', 5.7, 1.5, 26], ['ultra', 1.54, 2.4, 13], F_NEW], iosFrom('16.7.10')),
  apple('iPhone 14', 2022, 'back dual wide camera', [['main', 5.7, 1.5, 26], ['ultra', 1.54, 2.4, 13], F_NEW], iosFrom('16.7.10')),
  apple('iPhone 13 Pro Max', 2021, 'back triple camera', [['main', 5.7, 1.5, 26], ['ultra', 1.57, 1.8, 13], ['tele', 9, 2.8, 77], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 13 Pro', 2021, 'back triple camera', [['main', 5.7, 1.5, 26], ['ultra', 1.57, 1.8, 13], ['tele', 9, 2.8, 77], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 13', 2021, 'back dual wide camera', [['main', 5.1, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 13 mini', 2021, 'back dual wide camera', [['main', 5.1, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_OLD], iosFrom('15.8.3')),
  apple('iPhone SE (3rd generation)', 2022, 'back camera', [['main', 3.99, 1.8, 28], ['front', 2.87, 2.2, 31]], iosFrom('15.8.3')),
  apple('iPhone 12 Pro Max', 2020, 'back triple camera', [['main', 5.1, 1.6, 26], ['ultra', 1.54, 2.4, 13], ['tele', 7.5, 2.2, 65], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 12 Pro', 2020, 'back triple camera', [['main', 4.2, 1.6, 26], ['ultra', 1.54, 2.4, 13], ['tele', 6, 2, 52], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 12', 2020, 'back dual wide camera', [['main', 4.2, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 12 mini', 2020, 'back dual wide camera', [['main', 4.2, 1.6, 26], ['ultra', 1.54, 2.4, 13], F_OLD], iosFrom('15.8.3')),
  apple('iPhone 11 Pro Max', 2019, 'back triple camera', [['main', 4.25, 1.8, 26], ['ultra', 1.54, 2.4, 13], ['tele', 6, 2, 52], ['front', 2.71, 2.2, 23]], iosFrom('15.8.3')),
  apple('iPhone 11 Pro', 2019, 'back triple camera', [['main', 4.25, 1.8, 26], ['ultra', 1.54, 2.4, 13], ['tele', 6, 2, 52], ['front', 2.71, 2.2, 23]], iosFrom('15.8.3')),
  apple('iPhone 11', 2019, 'back dual wide camera', [['main', 4.25, 1.8, 26], ['ultra', 1.54, 2.4, 13], ['front', 2.71, 2.2, 23]], iosFrom('15.8.3')),
  apple('iPhone XR', 2018, 'back camera', [['main', 4.25, 1.8, 26], ['front', 2.87, 2.2, 32]], iosFrom('15.8.3', '18.6.2')),

  android('Samsung', 'samsung', 'SM-S938B', 'Galaxy S25 Ultra', 2025, [['main', 6.3, 1.7, 23], ['ultra', 1.8, 1.9, 13], ['tele', 6.7, 2.4, 67], ['front', 2.9, 2.2, 26]], ['S938BXXU1AYB4', 'S938BXXS3AYE1', 'S938BXXU4AYG2', 'S938BXXU6BYI3'], ['15', '16']),
  android('Samsung', 'samsung', 'SM-S937B', 'Galaxy S25 Edge', 2025, [['main', 6.3, 1.7, 24], ['ultra', 1.8, 1.9, 13], ['front', 2.9, 2.2, 26]], ['S937BXXU1AYE4', 'S937BXXU3BYI2'], ['15', '16']),
  android('Samsung', 'samsung', 'SM-S931B', 'Galaxy S25', 2025, [['main', 5.4, 1.8, 24], ['ultra', 2.2, 2.2, 13], ['tele', 5.8, 2.4, 70], ['front', 2.9, 2.2, 26]], ['S931BXXU1AYB4', 'S931BXXU4AYG2', 'S931BXXU6BYI3'], ['15', '16']),
  android('Samsung', 'samsung', 'SM-S928B', 'Galaxy S24 Ultra', 2024, [['main', 6.3, 1.7, 23], ['ultra', 2.2, 2.2, 13], ['tele', 6.7, 2.4, 67], ['front', 3, 2.2, 26]], ['S928BXXU1AXB5', 'S928BXXU3AXH7', 'S928BXXS5BYA1', 'S928BXXU7BYF8'], ['14', '15', '16']),
  android('Samsung', 'samsung', 'SM-S921B', 'Galaxy S24', 2024, [['main', 5.4, 1.8, 24], ['ultra', 2.2, 2.2, 13], ['tele', 5.8, 2.4, 70], ['front', 2.8, 2.2, 26]], ['S921BXXU1AXB5', 'S921BXXU3AXH7', 'S921BXXU6BYF8'], ['14', '15', '16']),
  android('Samsung', 'samsung', 'SM-S918B', 'Galaxy S23 Ultra', 2023, [['main', 6.3, 1.7, 23], ['ultra', 2.2, 2.2, 13], ['tele', 6.9, 2.4, 69], ['front', 3, 2.2, 26]], ['S918BXXU1AWBD', 'S918BXXU3BWK5', 'S918BXXS6CXK3', 'S918BXXU9EYE5'], ['13', '14', '15']),
  android('Samsung', 'samsung', 'SM-S911B', 'Galaxy S23', 2023, [['main', 5.4, 1.8, 24], ['ultra', 2.2, 2.2, 13], ['tele', 5.8, 2.4, 70], ['front', 2.8, 2.2, 26]], ['S911BXXU1AWBD', 'S911BXXU3BWK5', 'S911BXXU9EYE5'], ['13', '14', '15']),
  android('Samsung', 'samsung', 'SM-F956B', 'Galaxy Z Fold6', 2024, [['main', 5.4, 1.8, 23], ['ultra', 2.2, 2.2, 12], ['tele', 5.8, 2.4, 70], ['front', 2.2, 2.2, 24]], ['F956BXXU1AXGA', 'F956BXXU3BYE1'], ['14', '15']),
  android('Samsung', 'samsung', 'SM-F741B', 'Galaxy Z Flip6', 2024, [['main', 5.4, 1.8, 23], ['ultra', 2.2, 2.2, 13], ['front', 2.2, 2.2, 24]], ['F741BXXU1AXGA', 'F741BXXU3BYE1'], ['14', '15']),
  android('Samsung', 'samsung', 'SM-A566B', 'Galaxy A56', 2025, [['main', 5.4, 1.8, 24], ['ultra', 2.2, 2.2, 13], ['front', 2.8, 2.2, 26]], ['A566BXXU1AYC4', 'A566BXXU3AYG1'], ['15', '16']),
  android('Samsung', 'samsung', 'SM-A556B', 'Galaxy A55', 2024, [['main', 5.4, 1.8, 24], ['ultra', 2.2, 2.2, 13], ['front', 2.8, 2.2, 26]], ['A556BXXU1AXC9', 'A556BXXU4BYC2'], ['14', '15']),

  android('Google', 'Google', 'Pixel 10 Pro', 'Pixel 10 Pro', 2025, [['main', 6.9, 1.68, 24], ['ultra', 2.0, 1.7, 13], ['tele', 18, 2.8, 113], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.793424145zd', 'HDR+ 1.0.812947226zd'], ['16']),
  android('Google', 'Google', 'Pixel 10', 'Pixel 10', 2025, [['main', 6.0, 1.7, 25], ['ultra', 2.0, 2.2, 13], ['tele', 9.2, 3.1, 110], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.793424145zd'], ['16']),
  android('Google', 'Google', 'Pixel 9 Pro', 'Pixel 9 Pro', 2024, [['main', 6.9, 1.68, 24], ['ultra', 2.0, 1.7, 13], ['tele', 18, 2.8, 113], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.661934637zd', 'HDR+ 1.0.716532190zd', 'HDR+ 1.0.763451028zd'], ['14', '15', '16']),
  android('Google', 'Google', 'Pixel 9', 'Pixel 9', 2024, [['main', 6.9, 1.68, 25], ['ultra', 2.0, 1.7, 13], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.661934637zd', 'HDR+ 1.0.716532190zd'], ['14', '15', '16']),
  android('Google', 'Google', 'Pixel 8 Pro', 'Pixel 8 Pro', 2023, [['main', 6.9, 1.68, 24], ['ultra', 2.0, 1.95, 13], ['tele', 18, 2.8, 113], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.585432811zd', 'HDR+ 1.0.641377693zd'], ['14', '15', '16']),
  android('Google', 'Google', 'Pixel 8', 'Pixel 8', 2023, [['main', 6.9, 1.68, 25], ['ultra', 2.0, 2.2, 13], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.585432811zd', 'HDR+ 1.0.641377693zd'], ['14', '15', '16']),
  android('Google', 'Google', 'Pixel 8a', 'Pixel 8a', 2024, [['main', 5.4, 1.89, 26], ['ultra', 2.0, 2.2, 13], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.641377693zd'], ['14', '15', '16']),
  android('Google', 'Google', 'Pixel 7 Pro', 'Pixel 7 Pro', 2022, [['main', 6.81, 1.85, 24], ['ultra', 2.0, 2.2, 14], ['tele', 18, 3.5, 120], ['front', 2.7, 2.2, 21]], ['HDR+ 1.0.512404329zd', 'HDR+ 1.0.585432811zd'], ['13', '14', '15']),

  android('Xiaomi', 'Xiaomi', '24129PN74G', 'Xiaomi 15', 2024, [['main', 6.6, 1.62, 23], ['ultra', 2.2, 2.2, 14], ['tele', 8.0, 2.0, 60], ['front', 3.0, 2.0, 22]], [''], ['15']),
  android('Xiaomi', 'Xiaomi', '24030PN60G', 'Xiaomi 14 Ultra', 2024, [['main', 8.7, 1.63, 23], ['ultra', 2.2, 1.8, 12], ['tele', 9.0, 1.8, 75], ['front', 3.0, 2.0, 22]], [''], ['14', '15']),
  android('Xiaomi', 'Xiaomi', '23127PN0CG', 'Xiaomi 14', 2023, [['main', 6.6, 1.6, 23], ['ultra', 2.2, 2.2, 14], ['tele', 8.0, 2.0, 60], ['front', 3.0, 2.0, 22]], [''], ['14', '15']),
  android('Xiaomi', 'Redmi', '23117RA68G', 'Redmi Note 13 Pro 5G', 2023, [['main', 6.1, 1.65, 24], ['ultra', 1.9, 2.2, 15], ['front', 3.3, 2.4, 25]], [''], ['13', '14']),

  android('OnePlus', 'OnePlus', 'CPH2653', 'OnePlus 13', 2024, [['main', 6.9, 1.6, 23], ['ultra', 2.2, 2.0, 15], ['tele', 9.0, 2.6, 73], ['front', 2.9, 2.4, 21]], [''], ['15', '16']),
  android('OnePlus', 'OnePlus', 'CPH2581', 'OnePlus 12', 2024, [['main', 6.9, 1.6, 23], ['ultra', 2.2, 2.2, 14], ['tele', 9.0, 2.6, 70], ['front', 2.9, 2.4, 21]], [''], ['14', '15']),
  android('Huawei', 'HUAWEI', 'ALN-LX9', 'Mate 60 Pro', 2023, [['main', 6.9, 1.4, 23], ['ultra', 2.2, 2.2, 13], ['tele', 15, 3.0, 90], ['front', 2.9, 2.4, 18]], [''], ['12']),
  android('Huawei', 'HUAWEI', 'MNA-LX9', 'P60 Pro', 2023, [['main', 6.9, 1.4, 23], ['ultra', 2.2, 2.2, 13], ['tele', 15, 2.1, 90], ['front', 2.9, 2.4, 18]], [''], ['12']),
  android('Sony', 'Sony', 'XQ-EC54', 'Xperia 1 VI', 2024, [['main', 5.2, 1.9, 24], ['ultra', 1.8, 2.2, 16], ['tele', 14, 2.3, 85], ['front', 2.6, 2.0, 24]], ['68.1.A.2.85'], ['14', '15']),
  android('Nothing', 'Nothing', 'A065', 'Phone (2)', 2023, [['main', 5.4, 1.88, 24], ['ultra', 2.0, 2.2, 14], ['front', 3.0, 2.45, 24]], [''], ['13', '14', '15']),
];

export const BRANDS = [...new Set(DEVICES.map((d) => d.brand))];
