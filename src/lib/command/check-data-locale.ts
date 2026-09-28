/** Country-specific names & companies for realistic preview data. */

export interface CountryLocale {
  firstNames: string[];
  lastNames: string[];
  companies: string[];
  phoneFormat: (seed: number) => string;
  emailDomain: (company: string, seed: number) => string;
}

const US_LOCALE: CountryLocale = {
  firstNames: [
    "Sarah", "Michael", "Emily", "James", "Jessica", "David", "Ashley", "Robert", "Amanda", "Christopher",
    "Jennifer", "Daniel", "Nicole", "Matthew", "Stephanie", "Andrew", "Rachel", "Joshua", "Lauren", "Ryan",
    "Megan", "Brandon", "Hannah", "Justin", "Samantha", "Tyler", "Olivia", "Kevin", "Brittany", "Eric",
    "Katherine", "Brian", "Victoria", "Steven", "Alexandra", "Jason", "Natalie", "Timothy", "Rebecca", "Jacob",
  ],
  lastNames: [
    "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas",
    "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson",
    "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams",
    "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans",
  ],
  companies: [
    "Summit Dynamics", "Horizon Analytics", "Nexus Technologies", "Vertex Solutions",
    "Pulse Digital", "Atlas Systems", "Meridian Partners", "Catalyst Labs",
    "Prism Cloud", "Apex Group", "Sterling Innovations", "Pioneer Software",
    "Blue Ridge Systems", "Silverline Analytics", "Northstar Digital", "Clearwater Tech",
    "Ironwood Partners", "Lakeside Solutions", "Redwood Labs", "Granite Cloud",
  ],
  phoneFormat: (s) => `+1 (${200 + (s % 700)}) ${100 + (s % 900)}-${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
};

const UK_LOCALE: CountryLocale = {
  firstNames: [
    "Oliver", "Olivia", "George", "Amelia", "Harry", "Isla", "Jack", "Ava", "Charlie", "Emily",
    "William", "Sophia", "Thomas", "Grace", "Henry", "Lily", "Freddie", "Ella", "Archie", "Poppy",
    "Alfie", "Freya", "Oscar", "Evie", "Leo", "Florence", "Arthur", "Mia", "Theo", "Rosie",
  ],
  lastNames: [
    "Smith", "Jones", "Williams", "Taylor", "Brown", "Davies", "Evans", "Wilson", "Thomas", "Roberts",
    "Johnson", "Walker", "Wright", "Thompson", "White", "Hughes", "Edwards", "Green", "Hall", "Lewis",
    "Harris", "Clarke", "Patel", "Jackson", "Wood", "Turner", "Martin", "Cooper", "Hill", "Ward",
  ],
  companies: [
    "Whitmore & Co", "Blackstone Digital", "Harbour Systems", "Kensington Analytics",
    "Thames Partners", "Cambridge Labs", "Oxford Dynamics", "Bristol Tech Group",
    "Manchester Solutions", "Edinburgh Ventures", "Crown Data Services", "Union Cloud",
    "Mayfair Systems", "Canary Wharf Tech", "Highland Analytics", "Westminster Digital",
  ],
  phoneFormat: (s) => `+44 ${20 + (s % 70)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.co.uk`,
};

const IN_LOCALE: CountryLocale = {
  firstNames: [
    "Priya", "Rahul", "Ananya", "Arjun", "Kavya", "Vikram", "Neha", "Aditya", "Pooja", "Rohan",
    "Isha", "Karan", "Divya", "Siddharth", "Meera", "Aarav", "Sneha", "Nikhil", "Tanvi", "Varun",
    "Shreya", "Harsh", "Nandini", "Akash", "Riya", "Dev", "Anjali", "Yash", "Swati", "Manish",
    "Deepika", "Gaurav", "Lakshmi", "Sanjay", "Pallavi", "Abhishek", "Kritika", "Ritesh", "Aishwarya", "Suresh",
  ],
  lastNames: [
    "Sharma", "Patel", "Singh", "Kumar", "Reddy", "Gupta", "Iyer", "Nair", "Mehta", "Joshi",
    "Kapoor", "Malhotra", "Verma", "Chopra", "Banerjee", "Mukherjee", "Das", "Sen", "Menon", "Pillai",
    "Rao", "Gowda", "Desai", "Shah", "Kulkarni", "Chatterjee", "Bose", "Agarwal", "Saxena", "Trivedi",
    "Bhat", "Hegde", "Shetty", "Naidu", "Chauhan", "Yadav", "Thakur", "Mishra", "Pandey", "Srivastava",
  ],
  companies: [
    "Infosphere Tech", "Bharat Analytics", "Zenith Software", "Sapphire Solutions",
    "Nova Digital India", "Trident Systems", "Aarav Enterprises", "Vedika Labs",
    "Indus Cloud Services", "Ganges Partners", "Lotus Dynamics", "Himalaya Tech",
    "Monsoon Digital", "Taj Analytics", "Deccan Systems", "Spice Route Software",
    "Banyan Tree Tech", "Mumbai Meridian", "Bangalore Nexus", "Chennai Catalyst",
  ],
  phoneFormat: (s) => `+91 ${90000 + (s % 99999)} ${10000 + (s % 89999)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.in`,
};

const DE_LOCALE: CountryLocale = {
  firstNames: [
    "Lukas", "Emma", "Felix", "Hannah", "Maximilian", "Sophia", "Leon", "Marie", "Paul", "Anna",
    "Jonas", "Laura", "Tim", "Lena", "Finn", "Julia", "Ben", "Sarah", "Noah", "Lisa",
    "Elias", "Katharina", "Moritz", "Johanna", "Niklas", "Lea", "Jan", "Mia", "David", "Clara",
  ],
  lastNames: [
    "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz",
    "Koch", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger",
    "Hartmann", "Lange", "Schmitt", "Werner", "Schmitz", "Krause", "Meier", "Lehmann", "Huber", "Kaiser",
  ],
  companies: [
    "Rheinwerk GmbH", "Alpen Systems", "Berlin Digital AG", "Hanseatic Solutions",
    "Bavaria Tech", "Frankfurt Analytics", "Stuttgart Dynamics", "Hamburg Labs",
    "Dresden Innovations", "Cologne Partners", "Munich Cloud", "Leipzig Software",
    "Donau Digital", "Elbe Systems", "Schwarzwald Tech", "Rhine Valley Analytics",
  ],
  phoneFormat: (s) => `+49 ${150 + (s % 850)} ${1000000 + (s % 8999999)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.de`,
};

const FR_LOCALE: CountryLocale = {
  firstNames: [
    "Lucas", "Emma", "Louis", "Jade", "Gabriel", "Louise", "Raphaël", "Alice", "Adam", "Chloé",
    "Hugo", "Léa", "Arthur", "Manon", "Jules", "Camille", "Nathan", "Inès", "Ethan", "Sarah",
    "Tom", "Zoé", "Noah", "Lina", "Théo", "Juliette", "Enzo", "Clara", "Mathis", "Eva",
  ],
  lastNames: [
    "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau",
    "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier",
    "Girard", "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau", "Blanc", "Guerin", "Muller", "Henry",
  ],
  companies: [
    "Lumière Digital", "Paris Analytics", "Loire Systems", "Alpine Solutions",
    "Bordeaux Tech", "Lyon Dynamics", "Marseille Labs", "Normandie Partners",
    "Provence Cloud", "Riviera Software", "Seine Innovations", "Mont Blanc Group",
    "Côte Azure Tech", "Champagne Systems", "Bastille Analytics", "Versailles Digital",
  ],
  phoneFormat: (s) => `+33 ${1 + (s % 8)} ${10 + (s % 89)} ${10 + (s % 89)} ${10 + (s % 89)} ${10 + (s % 89)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.fr`,
};

const AU_LOCALE: CountryLocale = {
  firstNames: [
    "Jack", "Charlotte", "William", "Amelia", "Oliver", "Mia", "Noah", "Isla", "Henry", "Grace",
    "Leo", "Ava", "Lucas", "Chloe", "Thomas", "Sophie", "James", "Emily", "Ethan", "Olivia",
    "Liam", "Zoe", "Mason", "Ruby", "Cooper", "Ella", "Harrison", "Matilda", "Archie", "Harper",
  ],
  lastNames: [
    "Wilson", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Young",
    "Walker", "Hall", "Allen", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Campbell",
    "Mitchell", "Roberts", "Clark", "Turner", "Phillips", "Evans", "Nguyen", "Lee", "Singh", "Patel",
  ],
  companies: [
    "Southern Cross Tech", "Outback Analytics", "Harbour City Systems", "Pacific Solutions",
    "Koala Digital", "Sydney Dynamics", "Melbourne Labs", "Brisbane Partners",
    "Perth Cloud", "Adelaide Software", "Canberra Innovations", "Gold Coast Group",
    "Bondi Systems", "Uluru Analytics", "Great Barrier Tech", "Opera House Digital",
  ],
  phoneFormat: (s) => `+61 ${2 + (s % 7)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.au`,
};

const CA_LOCALE: CountryLocale = {
  firstNames: [
    "Liam", "Emma", "Noah", "Olivia", "Lucas", "Sophia", "Benjamin", "Ava", "Jacob", "Mia",
    "Logan", "Charlotte", "Mason", "Amelia", "Ethan", "Harper", "Alexander", "Evelyn", "Owen", "Abigail",
    "Nathan", "Emily", "Caleb", "Ella", "Ryan", "Chloe", "Daniel", "Victoria", "Matthew", "Hannah",
  ],
  lastNames: [
    "Smith", "Brown", "Tremblay", "Martin", "Roy", "Wilson", "MacDonald", "Gagnon", "Johnson", "Lee",
    "Campbell", "Anderson", "Taylor", "Thomas", "Thompson", "White", "Clark", "Lewis", "Walker", "Hall",
    "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter", "Mitchell",
  ],
  companies: [
    "Maple Leaf Tech", "Northern Lights Systems", "Toronto Analytics", "Vancouver Solutions",
    "Prairie Digital", "Quebec Dynamics", "Atlantic Labs", "Rockies Partners",
    "Canuck Cloud", "Great Lakes Software", "Polar Innovations", "Cascadia Group",
    "Hudson Bay Systems", "St. Lawrence Tech", "Pacific Rim Analytics", "Prairie Sky Digital",
  ],
  phoneFormat: (s) => `+1 (${200 + (s % 700)}) ${100 + (s % 900)}-${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.ca`,
};

const JP_LOCALE: CountryLocale = {
  firstNames: [
    "Haruto", "Yui", "Sota", "Hina", "Yuto", "Sakura", "Ren", "Aoi", "Kaito", "Mei",
    "Riku", "Rin", "Hayato", "Yuna", "Asahi", "Mio", "Tsubasa", "Himari", "Sho", "Akari",
    "Daiki", "Nanami", "Kota", "Misaki", "Ryota", "Nana", "Takumi", "Yuka", "Kenji", "Emi",
  ],
  lastNames: [
    "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato",
    "Yoshida", "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Mori",
    "Abe", "Ikeda", "Hashimoto", "Yamashita", "Ishikawa", "Nakajima", "Maeda", "Fujita", "Ogawa", "Goto",
  ],
  companies: [
    "Sakura Systems", "Tokyo Digital", "Fuji Analytics", "Osaka Solutions",
    "Rising Sun Tech", "Kyoto Dynamics", "Yokohama Labs", "Nagoya Partners",
    "Zenith Japan", "Pacific Rim Software", "Hinode Cloud", "Mirai Innovations",
    "Shibuya Tech", "Akihabara Systems", "Mount Fuji Analytics", "Samurai Digital",
  ],
  phoneFormat: (s) => `+81 ${10 + (s % 89)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.jp`,
};

const AE_LOCALE: CountryLocale = {
  firstNames: [
    "Mohammed", "Fatima", "Ahmed", "Aisha", "Omar", "Layla", "Khalid", "Noor", "Youssef", "Mariam",
    "Abdullah", "Sara", "Hassan", "Huda", "Ibrahim", "Zainab", "Ali", "Amira", "Saeed", "Dina",
    "Rashid", "Lina", "Tariq", "Nadia", "Faisal", "Rania", "Majid", "Yasmin", "Nasser", "Salma",
  ],
  lastNames: [
    "Al-Farsi", "Al-Rashid", "Khan", "Hassan", "Ibrahim", "Malik", "Nasser", "Qureshi", "Siddiqui", "Zayed",
    "Al-Maktoum", "Al-Nahyan", "Hussein", "Rahman", "Ansari", "Farooq", "Hamdan", "Jabri", "Khalil", "Mansoor",
    "Osman", "Qasim", "Saleh", "Taha", "Younis", "Bakr", "Darwish", "Fahad", "Ghani", "Haddad",
  ],
  companies: [
    "Gulf Horizon Tech", "Emirates Analytics", "Desert Star Systems", "Dubai Solutions",
    "Pearl Digital", "Sandstone Dynamics", "Marina Labs", "Oasis Partners",
    "Falcon Cloud", "Palm Software", "Crescent Innovations", "Skyline Group",
    "Burj Tech", "Dune Analytics", "Harbour Gate Systems", "Palm Jumeirah Digital",
  ],
  phoneFormat: (s) => `+971 ${50 + (s % 4)} ${100 + (s % 900)} ${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.ae`,
};

const BR_LOCALE: CountryLocale = {
  firstNames: [
    "Miguel", "Alice", "Arthur", "Laura", "Heitor", "Valentina", "Bernardo", "Helena", "Theo", "Isabella",
    "Gabriel", "Sophia", "Pedro", "Manuela", "Lucas", "Julia", "Rafael", "Lara", "Enzo", "Beatriz",
    "Gustavo", "Mariana", "Felipe", "Camila", "Bruno", "Lorena", "Diego", "Fernanda", "Leonardo", "Amanda",
  ],
  lastNames: [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
    "Costa", "Ribeiro", "Martins", "Carvalho", "Rocha", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa",
    "Cardoso", "Correia", "Dias", "Freitas", "Monteiro", "Moura", "Pinto", "Ramos", "Teixeira", "Vieira",
  ],
  companies: [
    "Brasil Digital", "Amazonia Tech", "Rio Analytics", "São Paulo Systems",
    "Copacabana Solutions", "Tropical Dynamics", "Cerrado Labs", "Atlântico Partners",
    "Samba Cloud", "Carioca Software", "Verde Innovations", "Horizonte Group",
    "Ipanema Systems", "Pantanal Tech", "Carnival Analytics", "Bossa Nova Digital",
  ],
  phoneFormat: (s) => `+55 ${11 + (s % 88)} ${90000 + (s % 99999)}-${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.br`,
};

const SG_LOCALE: CountryLocale = {
  firstNames: [
    "Ethan", "Emma", "Ryan", "Chloe", "Jayden", "Sophie", "Aiden", "Olivia", "Lucas", "Grace",
    "Nathan", "Hannah", "Daniel", "Rachel", "Marcus", "Jasmine", "Wei Ming", "Priya", "Arjun", "Siti",
    "Kai", "Mei Ling", "Ravi", "Nurul", "Benjamin", "Amelia", "Harsh", "Ying", "Farhan", "Anika",
  ],
  lastNames: [
    "Tan", "Lim", "Lee", "Ng", "Wong", "Goh", "Chua", "Koh", "Ong", "Teo",
    "Chan", "Lau", "Ho", "Yeo", "Sim", "Low", "Ang", "Tay", "Phua", "Quek",
    "Rahman", "Kumar", "Singh", "Patel", "Fernandez", "Chen", "Wang", "Ali", "Nair", "Ibrahim",
  ],
  companies: [
    "Lion City Tech", "Marina Bay Systems", "Orchard Analytics", "Sentosa Solutions",
    "Merlion Digital", "Raffles Dynamics", "Changi Labs", "Tanjong Partners",
    "Straits Cloud", "Garden Software", "Island Innovations", "Harbour Group",
    "Bugis Systems", "Clarke Quay Tech", "Esplanade Analytics", "Jurong Digital",
  ],
  phoneFormat: (s) => `+65 ${8000 + (s % 1999)} ${1000 + (s % 9000)}`,
  emailDomain: (c, s) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.sg`,
};

const COUNTRY_LOCALES: Record<string, CountryLocale> = {
  "United States": US_LOCALE,
  "United Kingdom": UK_LOCALE,
  "India": IN_LOCALE,
  "Germany": DE_LOCALE,
  "France": FR_LOCALE,
  "Australia": AU_LOCALE,
  "Canada": CA_LOCALE,
  "Japan": JP_LOCALE,
  "United Arab Emirates": AE_LOCALE,
  "Brazil": BR_LOCALE,
  "Singapore": SG_LOCALE,
  "Netherlands": {
    ...US_LOCALE,
    firstNames: [
      "Daan", "Emma", "Sem", "Sophie", "Lucas", "Julia", "Milan", "Lisa", "Levi", "Eva",
      "Finn", "Sanne", "Luuk", "Fleur", "Thijs", "Noor", "Bram", "Isa", "Jesse", "Roos",
    ],
    lastNames: [
      "de Vries", "Jansen", "Visser", "de Boer", "Bakker", "Mulder", "Meijer", "de Groot", "Bos", "Vos",
      "Peters", "Hendriks", "van Dijk", "Dekker", "Brouwer", "de Jong", "Smit", "van den Berg", "Kok", "Vermeer",
    ],
    companies: [
      "Amsterdam Digital", "Rotterdam Systems", "Dutch Analytics", "Holland Solutions", "Tulip Tech", "Canal Dynamics",
      "Windmill Systems", "Delft Analytics", "Utrecht Tech", "Haarlem Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.nl`,
    phoneFormat: (s) => `+31 ${6 + (s % 3)} ${10000000 + (s % 89999999)}`,
  },
  "China": {
    ...US_LOCALE,
    firstNames: [
      "Wei", "Fang", "Ming", "Li", "Jun", "Yan", "Hao", "Xin", "Jie", "Mei",
      "Chen", "Lin", "Yang", "Tao", "Qing", "Lei", "Ping", "Hong", "Xiao", "Ying",
    ],
    lastNames: [
      "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou",
      "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Gao", "Luo", "Zheng",
    ],
    companies: [
      "Dragon Tech", "Pearl River Systems", "Shanghai Analytics", "Beijing Solutions",
      "Great Wall Digital", "Panda Cloud", "Yangtze Systems", "Silk Road Tech",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.cn`,
    phoneFormat: (s) => `+86 ${130 + (s % 69)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  },
  "Mexico": {
    ...US_LOCALE,
    firstNames: [
      "Santiago", "Sofía", "Mateo", "Valentina", "Sebastián", "Camila", "Diego", "Mariana", "Daniel", "Regina",
      "Carlos", "Lucía", "Andrés", "Paula", "Javier", "Fernanda", "Ricardo", "Gabriela", "Luis", "Ana",
    ],
    lastNames: [
      "Hernández", "García", "Martínez", "López", "González", "Rodríguez", "Pérez", "Sánchez", "Ramírez", "Torres",
      "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Gutiérrez", "Ortiz", "Ramos",
    ],
    companies: [
      "Azteca Digital", "Maya Systems", "Ciudad Analytics", "Pacífico Solutions",
      "Sol Tech", "Frontera Cloud", "Sierra Madre Systems", "Plaza Mayor Tech",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.mx`,
    phoneFormat: (s) => `+52 ${55 + (s % 44)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  },
  "Italy": {
    ...US_LOCALE,
    firstNames: [
      "Leonardo", "Giulia", "Francesco", "Sofia", "Alessandro", "Aurora", "Lorenzo", "Ginevra", "Mattia", "Beatrice",
      "Andrea", "Chiara", "Marco", "Francesca", "Luca", "Valentina", "Giuseppe", "Elena", "Antonio", "Martina",
    ],
    lastNames: [
      "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco",
      "Bruno", "Gallo", "Conti", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri",
    ],
    companies: [
      "Milano Digital", "Roma Systems", "Venezia Analytics", "Toscana Solutions",
      "Dolomiti Tech", "Colosseo Cloud", "Duomo Systems", "Tiber Analytics",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.it`,
    phoneFormat: (s) => `+39 ${300 + (s % 699)} ${1000000 + (s % 8999999)}`,
  },
  "Spain": {
    ...US_LOCALE,
    firstNames: [
      "Hugo", "Lucía", "Martín", "María", "Lucas", "Paula", "Mateo", "Julia", "Daniel", "Emma",
      "Pablo", "Carmen", "Alejandro", "Laura", "Adrián", "Sara", "Diego", "Claudia", "Jorge", "Elena",
    ],
    lastNames: [
      "García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín",
      "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Navarro", "Torres",
    ],
    companies: [
      "Madrid Digital", "Barcelona Systems", "Ibérica Analytics", "Costa Solutions",
      "Sol Tech", "Plaza Cloud", "Sagrada Systems", "Andalucía Tech",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.es`,
    phoneFormat: (s) => `+34 ${600 + (s % 399)} ${100 + (s % 899)} ${100 + (s % 899)}`,
  },
  "South Korea": {
    ...JP_LOCALE,
    firstNames: [
      "Min-jun", "Seo-yeon", "Ji-ho", "Ha-yoon", "Do-yun", "Ji-woo", "Seo-jun", "Su-ah", "Ye-jun", "Chae-won",
      "Hyun-woo", "Min-seo", "Jun-seo", "Da-eun", "Si-woo", "Yoo-jin", "Jae-min", "So-yeon", "Tae-yang", "Hae-won",
    ],
    lastNames: [
      "Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim",
      "Han", "Shin", "Oh", "Seo", "Kwon", "Hwang", "Ahn", "Song", "Hong", "Bae",
    ],
    companies: [
      "Seoul Digital", "Han River Systems", "Gangnam Analytics", "Busan Solutions",
      "Hallyu Tech", "K-Star Cloud", "Namsan Systems", "Jeju Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.kr`,
    phoneFormat: (s) => `+82 ${10 + (s % 89)} ${1000 + (s % 9000)} ${1000 + (s % 9000)}`,
  },
  "Saudi Arabia": {
    ...AE_LOCALE,
    firstNames: [
      "Mohammed", "Fatima", "Ahmed", "Aisha", "Omar", "Layla", "Khalid", "Noor", "Youssef", "Mariam",
      "Fahad", "Noura", "Sultan", "Hessa", "Bandar", "Reem", "Turki", "Lama", "Waleed", "Joud",
    ],
    lastNames: [
      "Al-Saud", "Al-Otaibi", "Al-Ghamdi", "Al-Harbi", "Al-Qahtani", "Al-Dosari", "Al-Shammari", "Al-Anazi",
      "Al-Zahrani", "Al-Mutairi", "Al-Subaie", "Al-Enezi", "Al-Balawi", "Al-Johani", "Al-Shehri", "Al-Amri",
    ],
    companies: [
      "Riyadh Digital", "Neom Systems", "Red Sea Analytics", "Kingdom Solutions",
      "Hijaz Tech", "Arabian Cloud", "Diriyah Systems", "Oasis Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.sa`,
    phoneFormat: (s) => `+966 ${50 + (s % 9)} ${100 + (s % 899)} ${1000 + (s % 9000)}`,
  },
  "South Africa": {
    ...UK_LOCALE,
    firstNames: [
      "Liam", "Olivia", "Noah", "Emma", "Ethan", "Ava", "Mason", "Sophia", "Lucas", "Isabella",
      "Thabo", "Nomsa", "Sipho", "Lerato", "Johan", "Anika", "Pieter", "Zanele", "David", "Amahle",
    ],
    lastNames: [
      "Nkosi", "Dlamini", "Botha", "Pretorius", "Ndlovu", "Mokoena", "Van Wyk", "Mahlangu", "Govender", "Khumalo",
      "Naidoo", "Pillay", "Meyer", "Jacobs", "Sithole", "Molefe", "Coetzee", "Mabaso", "Zulu", "Ngcobo",
    ],
    companies: [
      "Cape Digital", "Joburg Systems", "Savanna Analytics", "Table Mountain Solutions",
      "Ubuntu Tech", "Rainbow Cloud", "Kruger Systems", "Veld Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.za`,
    phoneFormat: (s) => `+27 ${60 + (s % 30)} ${100 + (s % 899)} ${1000 + (s % 9000)}`,
  },
  "Pakistan": {
    ...IN_LOCALE,
    firstNames: [
      "Ali", "Ayesha", "Hassan", "Fatima", "Usman", "Zainab", "Bilal", "Sana", "Imran", "Hira",
      "Hamza", "Maryam", "Omar", "Sadia", "Tariq", "Nadia", "Faisal", "Rabia", "Kamran", "Amna",
    ],
    lastNames: [
      "Khan", "Ahmed", "Malik", "Hussain", "Sheikh", "Iqbal", "Raza", "Butt", "Chaudhry", "Siddiqui",
      "Qureshi", "Mirza", "Ansari", "Hashmi", "Dar", "Gill", "Warraich", "Cheema", "Bhatti", "Javed",
    ],
    companies: [
      "Karachi Digital", "Lahore Systems", "Indus Analytics", "Punjab Solutions",
      "Himalaya Tech", "Crescent Cloud", "Khyber Systems", "Sindh Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.pk`,
    phoneFormat: (s) => `+92 ${300 + (s % 99)} ${1000000 + (s % 8999999)}`,
  },
  "Nigeria": {
    ...UK_LOCALE,
    firstNames: [
      "Chidi", "Amara", "Emeka", "Ngozi", "Tunde", "Folake", "Obinna", "Adaeze", "Kunle", "Yemi",
      "Bola", "Ifeoma", "Segun", "Chioma", "Femi", "Halima", "Gbenga", "Zainab", "Uche", "Amina",
    ],
    lastNames: [
      "Okafor", "Adeyemi", "Nwosu", "Eze", "Bello", "Okonkwo", "Adebayo", "Chukwu", "Ibrahim", "Ogunleye",
      "Obi", "Musa", "Afolabi", "Yusuf", "Onyeka", "Suleiman", "Ekwueme", "Danjuma", "Ojo", "Abubakar",
    ],
    companies: [
      "Lagos Digital", "Abuja Systems", "Naija Analytics", "Savannah Solutions",
      "Green Eagle Tech", "Harmattan Cloud", "Niger Delta Systems", "Aso Rock Digital",
    ],
    emailDomain: (c) => `${c.toLowerCase().replace(/[^a-z0-9]/g, "")}.ng`,
    phoneFormat: (s) => `+234 ${800 + (s % 199)} ${100 + (s % 899)} ${1000 + (s % 9000)}`,
  },
};

const DEFAULT_LOCALE = US_LOCALE;

export function getCountryLocale(country: string): CountryLocale {
  return COUNTRY_LOCALES[country] ?? DEFAULT_LOCALE;
}

export const PREVIEW_ROW_COUNT = 25;

function mixIndex(length: number, row: number, salt: number, prime: number): number {
  if (length <= 0) return 0;
  const mixed = Math.imul(row + 1, prime) ^ salt ^ Math.imul(row, 0x9e3779b1);
  return Math.abs(mixed) % length;
}

export interface LocalizedPerson {
  first: string;
  last: string;
  fullName: string;
}

/** Picks varied first/last pairs — avoids repeating surnames across consecutive rows. */
export function generateLocalizedPerson(
  locale: CountryLocale,
  row: number,
  countrySalt: number,
  usedNames: Set<string>
): LocalizedPerson {
  const maxAttempts = Math.max(locale.firstNames.length, locale.lastNames.length, 25);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slot = row + attempt * 11;
    const firstIdx = mixIndex(locale.firstNames.length, slot, countrySalt ^ 0xa2c7a3, 17);
    const lastIdx = mixIndex(
      locale.lastNames.length,
      slot,
      countrySalt ^ 0x6f3a8b5 ^ Math.imul(row + attempt, 31),
      37
    );
    const first = locale.firstNames[firstIdx];
    const last = locale.lastNames[lastIdx];
    const fullName = `${first} ${last}`;

    if (!usedNames.has(fullName)) {
      usedNames.add(fullName);
      return { first, last, fullName };
    }
  }

  const first = locale.firstNames[mixIndex(locale.firstNames.length, row, countrySalt, 19)];
  const last = locale.lastNames[mixIndex(locale.lastNames.length, row, countrySalt ^ row, 41)];
  const fullName = `${first} ${last}`;
  usedNames.add(fullName);
  return { first, last, fullName };
}

export function pickVariedFromLocale<T>(arr: T[], row: number, salt: number, prime: number): T {
  return arr[mixIndex(arr.length, row, salt, prime)];
}

export function hashCountrySalt(country: string, baseSeed: number): number {
  let h = baseSeed ^ country.length;
  for (let i = 0; i < country.length; i++) {
    h = Math.imul(h ^ country.charCodeAt(i), 0x5bd1e995);
  }
  return Math.abs(h);
}
