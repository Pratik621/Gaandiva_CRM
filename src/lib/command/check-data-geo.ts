/** Geographic hierarchy for cascading Country → State → City filters. */

export interface GeoState {
  name: string;
  cities: string[];
}

export interface GeoCountry {
  name: string;
  states: GeoState[];
}

export const GEO_DATA: GeoCountry[] = [
  {
    name: "United States",
    states: [
      { name: "California", cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"] },
      { name: "New York", cities: ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse"] },
      { name: "Texas", cities: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"] },
      { name: "Florida", cities: ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale"] },
      { name: "Illinois", cities: ["Chicago", "Aurora", "Naperville", "Springfield", "Rockford"] },
      { name: "Washington", cities: ["Seattle", "Spokane", "Tacoma", "Bellevue", "Olympia"] },
      { name: "Massachusetts", cities: ["Boston", "Cambridge", "Worcester", "Springfield", "Lowell"] },
      { name: "Colorado", cities: ["Denver", "Boulder", "Colorado Springs", "Fort Collins", "Aurora"] },
      { name: "Georgia", cities: ["Atlanta", "Savannah", "Augusta", "Columbus", "Macon"] },
      { name: "New Jersey", cities: ["Newark", "Jersey City", "Princeton", "Trenton", "Hoboken"] },
      { name: "Virginia", cities: ["Arlington", "Richmond", "Virginia Beach", "Alexandria", "Norfolk"] },
      { name: "Pennsylvania", cities: ["Philadelphia", "Pittsburgh", "Harrisburg", "Allentown", "Erie"] },
    ],
  },
  {
    name: "United Kingdom",
    states: [
      { name: "England", cities: ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Cambridge"] },
      { name: "Scotland", cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness"] },
      { name: "Wales", cities: ["Cardiff", "Swansea", "Newport", "Wrexham", "Bangor"] },
      { name: "Northern Ireland", cities: ["Belfast", "Derry", "Lisburn", "Newry", "Armagh"] },
    ],
  },
  {
    name: "Canada",
    states: [
      { name: "Ontario", cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"] },
      { name: "British Columbia", cities: ["Vancouver", "Victoria", "Surrey", "Burnaby", "Kelowna"] },
      { name: "Quebec", cities: ["Montreal", "Quebec City", "Laval", "Gatineau", "Sherbrooke"] },
      { name: "Alberta", cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Banff"] },
      { name: "Manitoba", cities: ["Winnipeg", "Brandon", "Steinbach", "Thompson", "Portage la Prairie"] },
    ],
  },
  {
    name: "Germany",
    states: [
      { name: "Bavaria", cities: ["Munich", "Nuremberg", "Augsburg", "Regensburg", "Würzburg"] },
      { name: "Berlin", cities: ["Berlin"] },
      { name: "Hamburg", cities: ["Hamburg"] },
      { name: "Hesse", cities: ["Frankfurt", "Wiesbaden", "Darmstadt", "Kassel", "Offenbach"] },
      { name: "North Rhine-Westphalia", cities: ["Cologne", "Düsseldorf", "Dortmund", "Essen", "Bonn"] },
      { name: "Baden-Württemberg", cities: ["Stuttgart", "Karlsruhe", "Mannheim", "Freiburg", "Heidelberg"] },
    ],
  },
  {
    name: "France",
    states: [
      { name: "Île-de-France", cities: ["Paris", "Versailles", "Boulogne-Billancourt", "Saint-Denis", "Nanterre"] },
      { name: "Provence-Alpes-Côte d'Azur", cities: ["Marseille", "Nice", "Toulon", "Aix-en-Provence", "Cannes"] },
      { name: "Auvergne-Rhône-Alpes", cities: ["Lyon", "Grenoble", "Saint-Étienne", "Annecy", "Chambéry"] },
      { name: "Occitanie", cities: ["Toulouse", "Montpellier", "Nîmes", "Perpignan", "Carcassonne"] },
    ],
  },
  {
    name: "Australia",
    states: [
      { name: "New South Wales", cities: ["Sydney", "Newcastle", "Wollongong", "Canberra", "Parramatta"] },
      { name: "Victoria", cities: ["Melbourne", "Geelong", "Ballarat", "Bendigo", "Frankston"] },
      { name: "Queensland", cities: ["Brisbane", "Gold Coast", "Cairns", "Townsville", "Sunshine Coast"] },
      { name: "Western Australia", cities: ["Perth", "Fremantle", "Mandurah", "Bunbury", "Albany"] },
    ],
  },
  {
    name: "India",
    states: [
      { name: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"] },
      { name: "Karnataka", cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"] },
      { name: "Delhi", cities: ["New Delhi", "Delhi"] },
      { name: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"] },
      { name: "Telangana", cities: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"] },
      { name: "Gujarat", cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"] },
    ],
  },
  {
    name: "Singapore",
    states: [{ name: "Singapore", cities: ["Singapore", "Jurong", "Tampines", "Woodlands", "Sentosa"] }],
  },
  {
    name: "United Arab Emirates",
    states: [
      { name: "Dubai", cities: ["Dubai", "Jebel Ali", "Deira", "Marina", "Jumeirah"] },
      { name: "Abu Dhabi", cities: ["Abu Dhabi", "Al Ain", "Khalifa City", "Yas Island", "Saadiyat Island"] },
      { name: "Sharjah", cities: ["Sharjah", "Al Nahda", "Muwaileh", "Rolla", "Muwailah"] },
    ],
  },
  {
    name: "Netherlands",
    states: [
      { name: "North Holland", cities: ["Amsterdam", "Haarlem", "Alkmaar", "Zaandam", "Hilversum"] },
      { name: "South Holland", cities: ["Rotterdam", "The Hague", "Leiden", "Delft", "Gouda"] },
      { name: "Utrecht", cities: ["Utrecht", "Amersfoort", "Nieuwegein", "Veenendaal", "Zeist"] },
    ],
  },
  {
    name: "Japan",
    states: [
      { name: "Tokyo", cities: ["Tokyo", "Shibuya", "Shinjuku", "Minato", "Chiyoda"] },
      { name: "Osaka", cities: ["Osaka", "Sakai", "Higashiosaka", "Toyonaka", "Suita"] },
      { name: "Kanagawa", cities: ["Yokohama", "Kawasaki", "Sagamihara", "Fujisawa", "Kamakura"] },
    ],
  },
  {
    name: "China",
    states: [
      { name: "Beijing", cities: ["Beijing", "Chaoyang", "Haidian", "Dongcheng", "Fengtai"] },
      { name: "Shanghai", cities: ["Shanghai", "Pudong", "Huangpu", "Xuhui", "Minhang"] },
      { name: "Guangdong", cities: ["Guangzhou", "Shenzhen", "Dongguan", "Foshan", "Zhuhai"] },
    ],
  },
  {
    name: "Brazil",
    states: [
      { name: "São Paulo", cities: ["São Paulo", "Campinas", "Santos", "Guarulhos", "Sorocaba"] },
      { name: "Rio de Janeiro", cities: ["Rio de Janeiro", "Niterói", "Duque de Caxias", "Nova Iguaçu", "Petrópolis"] },
      { name: "Minas Gerais", cities: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim"] },
    ],
  },
  {
    name: "Mexico",
    states: [
      { name: "Mexico City", cities: ["Mexico City", "Coyoacán", "Polanco", "Roma", "Condesa"] },
      { name: "Jalisco", cities: ["Guadalajara", "Zapopan", "Tlaquepaque", "Puerto Vallarta", "Tepatitlán"] },
      { name: "Nuevo León", cities: ["Monterrey", "San Pedro Garza García", "Santa Catarina", "Guadalupe", "Apodaca"] },
    ],
  },
  {
    name: "Italy",
    states: [
      { name: "Lombardy", cities: ["Milan", "Bergamo", "Brescia", "Monza", "Como"] },
      { name: "Lazio", cities: ["Rome", "Latina", "Frosinone", "Viterbo", "Rieti"] },
      { name: "Tuscany", cities: ["Florence", "Pisa", "Siena", "Livorno", "Arezzo"] },
    ],
  },
  {
    name: "Spain",
    states: [
      { name: "Madrid", cities: ["Madrid", "Móstoles", "Alcalá de Henares", "Fuenlabrada", "Leganés"] },
      { name: "Catalonia", cities: ["Barcelona", "Girona", "Tarragona", "Lleida", "Sabadell"] },
      { name: "Andalusia", cities: ["Seville", "Málaga", "Córdoba", "Granada", "Cádiz"] },
    ],
  },
  {
    name: "South Korea",
    states: [
      { name: "Seoul", cities: ["Seoul", "Gangnam", "Mapo", "Jongno", "Songpa"] },
      { name: "Gyeonggi", cities: ["Suwon", "Goyang", "Yongin", "Seongnam", "Bucheon"] },
      { name: "Busan", cities: ["Busan", "Haeundae", "Seomyeon", "Nampo", "Gijang"] },
    ],
  },
  {
    name: "Saudi Arabia",
    states: [
      { name: "Riyadh", cities: ["Riyadh", "Diriyah", "Al Kharj", "Al Majma'ah", "Dawadmi"] },
      { name: "Makkah", cities: ["Jeddah", "Mecca", "Taif", "Rabigh", "Khulais"] },
      { name: "Eastern Province", cities: ["Dammam", "Dhahran", "Khobar", "Jubail", "Al Ahsa"] },
    ],
  },
  {
    name: "Sweden",
    states: [
      { name: "Stockholm", cities: ["Stockholm", "Solna", "Sundbyberg", "Nacka", "Huddinge"] },
      { name: "Västra Götaland", cities: ["Gothenburg", "Borås", "Mölndal", "Trollhättan", "Skövde"] },
      { name: "Skåne", cities: ["Malmö", "Helsingborg", "Lund", "Kristianstad", "Landskrona"] },
    ],
  },
  {
    name: "Switzerland",
    states: [
      { name: "Zürich", cities: ["Zürich", "Winterthur", "Uster", "Dübendorf", "Dietikon"] },
      { name: "Geneva", cities: ["Geneva", "Carouge", "Vernier", "Lancy", "Meyrin"] },
      { name: "Vaud", cities: ["Lausanne", "Montreux", "Yverdon-les-Bains", "Nyon", "Vevey"] },
    ],
  },
  {
    name: "Ireland",
    states: [
      { name: "Leinster", cities: ["Dublin", "Kilkenny", "Wexford", "Drogheda", "Dundalk"] },
      { name: "Munster", cities: ["Cork", "Limerick", "Waterford", "Tralee", "Ennis"] },
      { name: "Connacht", cities: ["Galway", "Sligo", "Castlebar", "Ballina", "Tuam"] },
    ],
  },
  {
    name: "Poland",
    states: [
      { name: "Masovian", cities: ["Warsaw", "Radom", "Płock", "Siedlce", "Pruszków"] },
      { name: "Lesser Poland", cities: ["Kraków", "Tarnów", "Nowy Sącz", "Oświęcim", "Chrzanów"] },
      { name: "Silesian", cities: ["Katowice", "Gliwice", "Sosnowiec", "Bytom", "Zabrze"] },
    ],
  },
  {
    name: "Belgium",
    states: [
      { name: "Brussels", cities: ["Brussels", "Ixelles", "Uccle", "Schaerbeek", "Anderlecht"] },
      { name: "Flanders", cities: ["Antwerp", "Ghent", "Bruges", "Leuven", "Mechelen"] },
      { name: "Wallonia", cities: ["Liège", "Charleroi", "Namur", "Mons", "La Louvière"] },
    ],
  },
  {
    name: "South Africa",
    states: [
      { name: "Gauteng", cities: ["Johannesburg", "Pretoria", "Sandton", "Soweto", "Midrand"] },
      { name: "Western Cape", cities: ["Cape Town", "Stellenbosch", "Paarl", "George", "Hermanus"] },
      { name: "KwaZulu-Natal", cities: ["Durban", "Pietermaritzburg", "Richards Bay", "Newcastle", "Ballito"] },
    ],
  },
  {
    name: "New Zealand",
    states: [
      { name: "Auckland", cities: ["Auckland", "Manukau", "North Shore", "Waitakere", "Papakura"] },
      { name: "Wellington", cities: ["Wellington", "Lower Hutt", "Porirua", "Upper Hutt", "Kapiti"] },
      { name: "Canterbury", cities: ["Christchurch", "Timaru", "Ashburton", "Rangiora", "Kaiapoi"] },
    ],
  },
  {
    name: "Philippines",
    states: [
      { name: "Metro Manila", cities: ["Manila", "Makati", "Quezon City", "Taguig", "Pasig"] },
      { name: "Cebu", cities: ["Cebu City", "Mandaue", "Lapu-Lapu", "Talisay", "Danao"] },
      { name: "Davao", cities: ["Davao City", "Tagum", "Panabo", "Digos", "Mati"] },
    ],
  },
  {
    name: "Indonesia",
    states: [
      { name: "Jakarta", cities: ["Jakarta", "South Jakarta", "Central Jakarta", "North Jakarta", "East Jakarta"] },
      { name: "West Java", cities: ["Bandung", "Bekasi", "Bogor", "Depok", "Cimahi"] },
      { name: "East Java", cities: ["Surabaya", "Malang", "Kediri", "Madiun", "Blitar"] },
    ],
  },
  {
    name: "Malaysia",
    states: [
      { name: "Kuala Lumpur", cities: ["Kuala Lumpur", "Bangsar", "Cheras", "Bukit Bintang", "Mont Kiara"] },
      { name: "Selangor", cities: ["Shah Alam", "Petaling Jaya", "Subang Jaya", "Klang", "Kajang"] },
      { name: "Penang", cities: ["George Town", "Bayan Lepas", "Butterworth", "Bukit Mertajam", "Balik Pulau"] },
    ],
  },
  {
    name: "Thailand",
    states: [
      { name: "Bangkok", cities: ["Bangkok", "Chatuchak", "Silom", "Sukhumvit", "Thonburi"] },
      { name: "Chiang Mai", cities: ["Chiang Mai", "Mae Rim", "Hang Dong", "San Kamphaeng", "Doi Saket"] },
      { name: "Phuket", cities: ["Phuket Town", "Patong", "Kata", "Karon", "Rawai"] },
    ],
  },
  {
    name: "Vietnam",
    states: [
      { name: "Ho Chi Minh City", cities: ["Ho Chi Minh City", "District 1", "District 7", "Thủ Đức", "Bình Thạnh"] },
      { name: "Hanoi", cities: ["Hanoi", "Ba Đình", "Cầu Giấy", "Đống Đa", "Hoàn Kiếm"] },
      { name: "Da Nang", cities: ["Da Nang", "Hải Châu", "Sơn Trà", "Ngũ Hành Sơn", "Cẩm Lệ"] },
    ],
  },
  {
    name: "Turkey",
    states: [
      { name: "Istanbul", cities: ["Istanbul", "Kadıköy", "Beşiktaş", "Şişli", "Üsküdar"] },
      { name: "Ankara", cities: ["Ankara", "Çankaya", "Keçiören", "Yenimahalle", "Mamak"] },
      { name: "Izmir", cities: ["Izmir", "Konak", "Bornova", "Karşıyaka", "Buca"] },
    ],
  },
  {
    name: "Israel",
    states: [
      { name: "Tel Aviv", cities: ["Tel Aviv", "Ramat Gan", "Herzliya", "Bat Yam", "Holon"] },
      { name: "Jerusalem", cities: ["Jerusalem", "Beit Shemesh", "Mevaseret Zion", "Abu Ghosh", "Mevaseret"] },
      { name: "Haifa", cities: ["Haifa", "Nesher", "Kiryat Bialik", "Kiryat Motzkin", "Tirat Carmel"] },
    ],
  },
  {
    name: "Nigeria",
    states: [
      { name: "Lagos", cities: ["Lagos", "Ikeja", "Lekki", "Victoria Island", "Surulere"] },
      { name: "Abuja", cities: ["Abuja", "Gwarinpa", "Wuse", "Maitama", "Asokoro"] },
      { name: "Rivers", cities: ["Port Harcourt", "Bonny", "Eleme", "Okrika", "Degema"] },
    ],
  },
  {
    name: "Kenya",
    states: [
      { name: "Nairobi", cities: ["Nairobi", "Westlands", "Karen", "Kilimani", "Lavington"] },
      { name: "Mombasa", cities: ["Mombasa", "Nyali", "Bamburi", "Likoni", "Changamwe"] },
      { name: "Kiambu", cities: ["Thika", "Ruiru", "Kiambu Town", "Kikuyu", "Limuru"] },
    ],
  },
  {
    name: "Argentina",
    states: [
      { name: "Buenos Aires", cities: ["Buenos Aires", "La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes"] },
      { name: "Córdoba", cities: ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "Alta Gracia", "Villa María"] },
      { name: "Santa Fe", cities: ["Rosario", "Santa Fe", "Rafaela", "Venado Tuerto", "Reconquista"] },
    ],
  },
  {
    name: "Chile",
    states: [
      { name: "Santiago", cities: ["Santiago", "Providencia", "Las Condes", "Ñuñoa", "Maipú"] },
      { name: "Valparaíso", cities: ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio"] },
      { name: "Biobío", cities: ["Concepción", "Talcahuano", "Los Ángeles", "Coronel", "Chillán"] },
    ],
  },
  {
    name: "Colombia",
    states: [
      { name: "Bogotá", cities: ["Bogotá", "Chapinero", "Usaquén", "Suba", "Kennedy"] },
      { name: "Antioquia", cities: ["Medellín", "Envigado", "Bello", "Itagüí", "Rionegro"] },
      { name: "Valle del Cauca", cities: ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago"] },
    ],
  },
  {
    name: "Portugal",
    states: [
      { name: "Lisbon", cities: ["Lisbon", "Cascais", "Sintra", "Amadora", "Oeiras"] },
      { name: "Porto", cities: ["Porto", "Vila Nova de Gaia", "Matosinhos", "Gondomar", "Maia"] },
      { name: "Braga", cities: ["Braga", "Guimarães", "Famalicão", "Barcelos", "Esposende"] },
    ],
  },
  {
    name: "Austria",
    states: [
      { name: "Vienna", cities: ["Vienna", "Donaustadt", "Favoriten", "Leopoldstadt", "Penzing"] },
      { name: "Tyrol", cities: ["Innsbruck", "Kufstein", "Telfs", "Hall in Tirol", "Schwaz"] },
      { name: "Salzburg", cities: ["Salzburg", "Hallein", "Saalfelden", "Bischofshofen", "Zell am See"] },
    ],
  },
  {
    name: "Norway",
    states: [
      { name: "Oslo", cities: ["Oslo", "Bærum", "Asker", "Drammen", "Lillestrøm"] },
      { name: "Vestland", cities: ["Bergen", "Stord", "Førde", "Florø", "Måløy"] },
      { name: "Rogaland", cities: ["Stavanger", "Sandnes", "Haugesund", "Sola", "Randaberg"] },
    ],
  },
  {
    name: "Denmark",
    states: [
      { name: "Capital Region", cities: ["Copenhagen", "Frederiksberg", "Hellerup", "Gentofte", "Glostrup"] },
      { name: "Central Denmark", cities: ["Aarhus", "Randers", "Horsens", "Silkeborg", "Viborg"] },
      { name: "Southern Denmark", cities: ["Odense", "Esbjerg", "Kolding", "Vejle", "Fredericia"] },
    ],
  },
  {
    name: "Finland",
    states: [
      { name: "Uusimaa", cities: ["Helsinki", "Espoo", "Vantaa", "Porvoo", "Järvenpää"] },
      { name: "Pirkanmaa", cities: ["Tampere", "Nokia", "Ylöjärvi", "Kangasala", "Lempäälä"] },
      { name: "Southwest Finland", cities: ["Turku", "Salo", "Kaarina", "Raisio", "Naantali"] },
    ],
  },
  {
    name: "Pakistan",
    states: [
      { name: "Punjab", cities: ["Lahore", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala"] },
      { name: "Sindh", cities: ["Karachi", "Hyderabad", "Sukkur", "Larkana", "Mirpur Khas"] },
      { name: "Islamabad", cities: ["Islamabad", "Rawalpindi", "Murree", "Taxila", "Bahria Town"] },
    ],
  },
  {
    name: "Bangladesh",
    states: [
      { name: "Dhaka", cities: ["Dhaka", "Gazipur", "Narayanganj", "Savar", "Tongi"] },
      { name: "Chittagong", cities: ["Chittagong", "Cox's Bazar", "Comilla", "Feni", "Rangamati"] },
      { name: "Khulna", cities: ["Khulna", "Jessore", "Kushtia", "Satkhira", "Bagerhat"] },
    ],
  },
  {
    name: "Egypt",
    states: [
      { name: "Cairo", cities: ["Cairo", "Giza", "Heliopolis", "Maadi", "Nasr City"] },
      { name: "Alexandria", cities: ["Alexandria", "Borg El Arab", "Montaza", "Smouha", "Agami"] },
      { name: "Giza", cities: ["6th of October", "Sheikh Zayed", "Dokki", "Mohandessin", "Imbaba"] },
    ],
  },
  {
    name: "Greece",
    states: [
      { name: "Attica", cities: ["Athens", "Piraeus", "Glyfada", "Marousi", "Kallithea"] },
      { name: "Central Macedonia", cities: ["Thessaloniki", "Katerini", "Serres", "Veria", "Kilkis"] },
      { name: "Crete", cities: ["Heraklion", "Chania", "Rethymno", "Agios Nikolaos", "Ierapetra"] },
    ],
  },
  {
    name: "Romania",
    states: [
      { name: "Bucharest", cities: ["Bucharest", "Sector 1", "Sector 2", "Sector 3", "Sector 4"] },
      { name: "Cluj", cities: ["Cluj-Napoca", "Turda", "Dej", "Gherla", "Huedin"] },
      { name: "Timiș", cities: ["Timișoara", "Lugoj", "Jimbolia", "Sânnicolau Mare", "Făget"] },
    ],
  },
  {
    name: "Czech Republic",
    states: [
      { name: "Prague", cities: ["Prague", "Prague 1", "Prague 5", "Prague 9", "Dejvice"] },
      { name: "South Moravian", cities: ["Brno", "Znojmo", "Břeclav", "Hodonín", "Vyškov"] },
      { name: "Moravian-Silesian", cities: ["Ostrava", "Opava", "Karviná", "Frýdek-Místek", "Havířov"] },
    ],
  },
  {
    name: "Hungary",
    states: [
      { name: "Budapest", cities: ["Budapest", "Buda", "Pest", "Óbuda", "Újbuda"] },
      { name: "Pest", cities: ["Érd", "Szentendre", "Gödöllő", "Dunakeszi", "Vecsés"] },
      { name: "Győr-Moson-Sopron", cities: ["Győr", "Sopron", "Mosonmagyaróvár", "Kapuvár", "Csorna"] },
    ],
  },
];

export const ALL_COUNTRIES = GEO_DATA.map((c) => c.name).sort();

export function getStatesForCountries(countries: string[]): string[] {
  if (!countries.length) return [];
  const set = new Set<string>();
  for (const country of countries) {
    const geo = GEO_DATA.find((c) => c.name === country);
    geo?.states.forEach((s) => set.add(s.name));
  }
  return Array.from(set).sort();
}

export function getCitiesForSelection(countries: string[], states: string[]): string[] {
  if (!countries.length) return [];
  const set = new Set<string>();
  for (const country of countries) {
    const geo = GEO_DATA.find((c) => c.name === country);
    if (!geo) continue;
    for (const state of geo.states) {
      if (states.length === 0 || states.includes(state.name)) {
        state.cities.forEach((city) => set.add(city));
      }
    }
  }
  return Array.from(set).sort();
}

export function pruneGeoSelection(
  countries: string[],
  states: string[],
  cities: string[]
): { countries: string[]; states: string[]; cities: string[] } {
  const validStates = getStatesForCountries(countries);
  const nextStates = states.filter((s) => validStates.includes(s));
  const validCities = getCitiesForSelection(countries, nextStates);
  const nextCities = cities.filter((c) => validCities.includes(c));
  return { countries, states: nextStates, cities: nextCities };
}
