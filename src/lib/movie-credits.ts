/**
 * ============================================================================
 * [o1] Cinema Synergy: Cast & Crew Data Module
 * ============================================================================
 * Bu modül "o1" geliştirmesi kapsamında oluşturulmuştur.
 * Ortak filmler üzerinden en yüksek uyuma sahip yönetmen ve oyuncuyu ("The Unifying Director"
 * ve "The Unifying Actor") en az 2 ortak film güvenilirlik filtresiyle hesaplar.
 * "o1 iptal" dendiğinde bu sistem güvenli bir şekilde geri alınabilir.
 * ============================================================================
 */

import { MatchedMovie } from "./types";

export interface MovieCredits {
  director?: string;
  cast: string[];
  year?: number;
}

export interface PersonSynergy {
  name: string;
  role: "director" | "actor";
  averageRating: number;
  sharedFilmsCount: number;
  filmTitles: string[];
  isFallback?: boolean;
}

export interface CinemaSynergyResult {
  unifyingDirector: PersonSynergy | null;
  unifyingActor: PersonSynergy | null;
  totalSharedFilms: number;
  hasReliableDirector: boolean;
  hasReliableActor: boolean;
}

// Film verilerini normalleştiren yardımcı anahtar üretici
function normalizeMovieKey(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Genişletilmiş Letterboxd Popüler Film & Ekip Veritabanı
 * Başlık ve slug üzerinden hızlıca eşleşir.
 */
export const MOVIE_CREDITS_DATABASE: Record<string, MovieCredits> = {
  // Denis Villeneuve
  "blade-runner-2049": { director: "Denis Villeneuve", year: 2017, cast: ["Ryan Gosling", "Harrison Ford", "Ana de Armas", "Sylvia Hoeks", "Mackenzie Davis"] },
  "dune-1984": { director: "David Lynch", year: 1984, cast: ["Kyle MacLachlan", "Virginia Madsen", "Francesca Annis", "Sting"] },
  "dune": { director: "Denis Villeneuve", year: 2021, cast: ["Timothée Chalamet", "Rebecca Ferguson", "Oscar Isaac", "Josh Brolin", "Zendaya", "Javier Bardem", "Dave Bautista", "Stellan Skarsgård", "Jason Momoa", "Charlotte Rampling"] },
  "dune-2021": { director: "Denis Villeneuve", year: 2021, cast: ["Timothée Chalamet", "Rebecca Ferguson", "Oscar Isaac", "Josh Brolin", "Zendaya", "Javier Bardem", "Dave Bautista", "Stellan Skarsgård", "Jason Momoa", "Charlotte Rampling"] },
  "dune-part-two": { director: "Denis Villeneuve", year: 2024, cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem", "Josh Brolin", "Austin Butler", "Florence Pugh", "Dave Bautista", "Christopher Walken", "Léa Seydoux", "Stellan Skarsgård"] },
  "dune-2": { director: "Denis Villeneuve", year: 2024, cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem", "Josh Brolin", "Austin Butler", "Florence Pugh", "Dave Bautista", "Christopher Walken", "Léa Seydoux", "Stellan Skarsgård"] },
  "dune-part-2": { director: "Denis Villeneuve", year: 2024, cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem", "Josh Brolin", "Austin Butler", "Florence Pugh", "Dave Bautista", "Christopher Walken", "Léa Seydoux", "Stellan Skarsgård"] },
  "arrival": { director: "Denis Villeneuve", cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker", "Michael Stuhlbarg"] },
  "sicario": { director: "Denis Villeneuve", cast: ["Emily Blunt", "Benicio del Toro", "Josh Brolin", "Daniel Kaluuya"] },
  "prisoners": { director: "Denis Villeneuve", cast: ["Hugh Jackman", "Jake Gyllenhaal", "Viola Davis", "Paul Dano", "Terrence Howard"] },
  "incendies": { director: "Denis Villeneuve", cast: ["Lubna Azabal", "Mélissa Désormeaux-Poulin", "Maxim Gaudette"] },
  "enemy": { director: "Denis Villeneuve", cast: ["Jake Gyllenhaal", "Mélanie Laurent", "Sarah Gadon", "Isabella Rossellini"] },

  // Damien Chazelle & Ryan Gosling
  "la-la-land": { director: "Damien Chazelle", cast: ["Ryan Gosling", "Emma Stone", "John Legend", "Rosemarie DeWitt"] },
  "whiplash": { director: "Damien Chazelle", cast: ["Miles Teller", "J.K. Simmons", "Paul Reiser", "Melissa Benoist"] },
  "first-man": { director: "Damien Chazelle", cast: ["Ryan Gosling", "Claire Foy", "Jason Clarke", "Kyle Chandler"] },
  "babylon": { director: "Damien Chazelle", cast: ["Brad Pitt", "Margot Robbie", "Diego Calva", "Jean Smart", "Tobey Maguire"] },

  // Ryan Gosling
  "drive": { director: "Nicolas Winding Refn", cast: ["Ryan Gosling", "Carey Mulligan", "Bryan Cranston", "Albert Brooks", "Oscar Isaac"] },
  "the-nice-guys": { director: "Shane Black", cast: ["Ryan Gosling", "Russell Crowe", "Angourie Rice", "Matt Bomer"] },
  "barbie": { director: "Greta Gerwig", cast: ["Margot Robbie", "Ryan Gosling", "America Ferrera", "Kate McKinnon", "Will Ferrell", "Simu Liu"] },
  "the-place-beyond-the-pines": { director: "Derek Cianfrance", cast: ["Ryan Gosling", "Bradley Cooper", "Eva Mendes", "Mahershala Ali", "Ben Mendelsohn"] },
  "blue-valentine": { director: "Derek Cianfrance", cast: ["Ryan Gosling", "Michelle Williams", "Faith Wladyka"] },
  "the-big-short": { director: "Adam McKay", cast: ["Christian Bale", "Steve Carell", "Ryan Gosling", "Brad Pitt"] },
  "crazy-stupid-love": { director: "Glenn Ficarra", cast: ["Steve Carell", "Ryan Gosling", "Julianne Moore", "Emma Stone"] },
  "the-notebook": { director: "Nick Cassavetes", cast: ["Ryan Gosling", "Rachel McAdams", "James Garner", "Gena Rowlands"] },
  "the-fall-guy": { director: "David Leitch", cast: ["Ryan Gosling", "Emily Blunt", "Aaron Taylor-Johnson", "Hannah Waddingham"] },

  // Christopher Nolan
  "oppenheimer": { director: "Christopher Nolan", cast: ["Cillian Murphy", "Emily Blunt", "Matt Damon", "Robert Downey Jr.", "Florence Pugh"] },
  "interstellar": { director: "Christopher Nolan", cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain", "Michael Caine", "Matt Damon"] },
  "inception": { director: "Christopher Nolan", cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy", "Ken Watanabe", "Cillian Murphy", "Marion Cotillard"] },
  "the-dark-knight": { director: "Christopher Nolan", cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart", "Michael Caine", "Maggie Gyllenhaal", "Gary Oldman", "Morgan Freeman"] },
  "the-dark-knight-rises": { director: "Christopher Nolan", cast: ["Christian Bale", "Tom Hardy", "Anne Hathaway", "Joseph Gordon-Levitt", "Marion Cotillard", "Gary Oldman", "Michael Caine"] },
  "batman-begins": { director: "Christopher Nolan", cast: ["Christian Bale", "Michael Caine", "Liam Neeson", "Katie Holmes", "Gary Oldman", "Cillian Murphy", "Morgan Freeman"] },
  "the-prestige": { director: "Christopher Nolan", cast: ["Hugh Jackman", "Christian Bale", "Michael Caine", "Scarlett Johansson", "Rebecca Hall", "David Bowie"] },
  "memento": { director: "Christopher Nolan", cast: ["Guy Pearce", "Carrie-Anne Moss", "Joe Pantoliano"] },
  "dunkirk": { director: "Christopher Nolan", cast: ["Fionn Whitehead", "Tom Hardy", "Mark Rylance", "Kenneth Branagh", "Cillian Murphy", "Harry Styles"] },
  "tenet": { director: "Christopher Nolan", cast: ["John David Washington", "Robert Pattinson", "Elizabeth Debicki", "Kenneth Branagh", "Michael Caine"] },

  // Quentin Tarantino
  "pulp-fiction": { director: "Quentin Tarantino", cast: ["John Travolta", "Samuel L. Jackson", "Uma Thurman", "Bruce Willis", "Ving Rhames", "Harvey Keitel", "Tim Roth"] },
  "inglourious-basterds": { director: "Quentin Tarantino", cast: ["Brad Pitt", "Christoph Waltz", "Michael Fassbender", "Mélanie Laurent", "Diane Kruger", "Daniel Brühl"] },
  "django-unchained": { director: "Quentin Tarantino", cast: ["Jamie Foxx", "Christoph Waltz", "Leonardo DiCaprio", "Kerry Washington", "Samuel L. Jackson"] },
  "once-upon-a-time-in-hollywood": { director: "Quentin Tarantino", cast: ["Leonardo DiCaprio", "Brad Pitt", "Margot Robbie", "Emile Hirsch", "Margaret Qualley", "Al Pacino"] },
  "kill-bill-vol-1": { director: "Quentin Tarantino", cast: ["Uma Thurman", "Lucy Liu", "Vivica A. Fox", "Daryl Hannah", "David Carradine"] },
  "kill-bill-vol-2": { director: "Quentin Tarantino", cast: ["Uma Thurman", "David Carradine", "Michael Madsen", "Daryl Hannah"] },
  "reservoir-dogs": { director: "Quentin Tarantino", cast: ["Harvey Keitel", "Tim Roth", "Michael Madsen", "Chris Penn", "Steve Buscemi"] },
  "the-hateful-eight": { director: "Quentin Tarantino", cast: ["Samuel L. Jackson", "Kurt Russell", "Jennifer Jason Leigh", "Walton Goggins", "Demián Bichir", "Tim Roth"] },

  // Martin Scorsese
  "taxi-driver": { director: "Martin Scorsese", cast: ["Robert De Niro", "Jodie Foster", "Cybill Shepherd", "Harvey Keitel", "Peter Boyle"] },
  "goodfellas": { director: "Martin Scorsese", cast: ["Robert De Niro", "Ray Liotta", "Joe Pesci", "Lorraine Bracco", "Paul Sorvino"] },
  "the-wolf-of-wall-street": { director: "Martin Scorsese", cast: ["Leonardo DiCaprio", "Jonah Hill", "Margot Robbie", "Matthew McConaughey", "Kyle Chandler", "Rob Reiner"] },
  "shutter-island": { director: "Martin Scorsese", cast: ["Leonardo DiCaprio", "Mark Ruffalo", "Ben Kingsley", "Michelle Williams", "Emily Mortimer", "Max von Sydow"] },
  "the-departed": { director: "Martin Scorsese", cast: ["Leonardo DiCaprio", "Matt Damon", "Jack Nicholson", "Mark Wahlberg", "Martin Sheen", "Vera Farmiga"] },
  "killers-of-the-flower-moon": { director: "Martin Scorsese", cast: ["Leonardo DiCaprio", "Robert De Niro", "Lily Gladstone", "Jesse Plemons", "Tantoo Cardinal"] },
  "raging-bull": { director: "Martin Scorsese", cast: ["Robert De Niro", "Joe Pesci", "Cathy Moriarty", "Frank Vincent"] },
  "casino": { director: "Martin Scorsese", cast: ["Robert De Niro", "Sharon Stone", "Joe Pesci", "James Woods"] },
  "the-irishman": { director: "Martin Scorsese", cast: ["Robert De Niro", "Al Pacino", "Joe Pesci", "Harvey Keitel", "Ray Romano"] },

  // David Fincher
  "fight-club": { director: "David Fincher", cast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter", "Meat Loaf", "Jared Leto"] },
  "se7en": { director: "David Fincher", cast: ["Brad Pitt", "Morgan Freeman", "Gwyneth Paltrow", "Kevin Spacey", "John C. McGinley"] },
  "the-social-network": { director: "David Fincher", cast: ["Jesse Eisenberg", "Andrew Garfield", "Justin Timberlake", "Armie Hammer", "Rooney Mara"] },
  "gone-girl": { director: "David Fincher", cast: ["Ben Affleck", "Rosamund Pike", "Neil Patrick Harris", "Tyler Perry", "Carrie Coon"] },
  "zodiac": { director: "David Fincher", cast: ["Jake Gyllenhaal", "Mark Ruffalo", "Robert Downey Jr.", "Anthony Edwards", "Brian Cox"] },
  "the-curious-case-of-benjamin-button": { director: "David Fincher", cast: ["Brad Pitt", "Cate Blanchett", "Taraji P. Henson", "Julia Ormond"] },
  "the-girl-with-the-dragon-tattoo": { director: "David Fincher", cast: ["Daniel Craig", "Rooney Mara", "Christopher Plummer", "Stellan Skarsgård"] },

  // Greta Gerwig & Emma Stone & Yorgos Lanthimos
  "lady-bird": { director: "Greta Gerwig", cast: ["Saoirse Ronan", "Laurie Metcalf", "Tracy Letts", "Lucas Hedges", "Timothée Chalamet"] },
  "little-women": { director: "Greta Gerwig", cast: ["Saoirse Ronan", "Emma Watson", "Florence Pugh", "Eliza Scanlen", "Laura Dern", "Timothée Chalamet", "Meryl Streep"] },
  "poor-things": { director: "Yorgos Lanthimos", cast: ["Emma Stone", "Mark Ruffalo", "Willem Dafoe", "Ramy Youssef", "Christopher Abbott"] },
  "the-favourite": { director: "Yorgos Lanthimos", cast: ["Olivia Colman", "Emma Stone", "Rachel Weisz", "Nicholas Hoult", "Joe Alwyn"] },
  "the-lobster": { director: "Yorgos Lanthimos", cast: ["Colin Farrell", "Rachel Weisz", "Jessica Barden", "Olivia Colman", "John C. Reilly"] },
  "the-killing-of-a-sacred-deer": { director: "Yorgos Lanthimos", cast: ["Colin Farrell", "Nicole Kidman", "Barry Keoghan", "Raffey Cassidy", "Alicia Silverstone"] },
  "kinds-of-kindness": { director: "Yorgos Lanthimos", cast: ["Emma Stone", "Jesse Plemons", "Willem Dafoe", "Margaret Qualley", "Hong Chau"] },
  "birdman": { director: "Alejandro G. Iñárritu", cast: ["Michael Keaton", "Edward Norton", "Emma Stone", "Naomi Watts", "Zach Galifianakis"] },
  "easy-a": { director: "Will Gluck", cast: ["Emma Stone", "Penn Badgley", "Amanda Bynes", "Thomas Haden Church", "Patricia Clarkson"] },
  "cruella": { director: "Craig Gillespie", cast: ["Emma Stone", "Emma Thompson", "Joel Fry", "Paul Walter Hauser"] },

  // Wes Anderson
  "the-grand-budapest-hotel": { director: "Wes Anderson", cast: ["Ralph Fiennes", "Tony Revolori", "F. Murray Abraham", "Mathieu Amalric", "Adrien Brody", "Willem Dafoe", "Saoirse Ronan"] },
  "fantastic-mr-fox": { director: "Wes Anderson", cast: ["George Clooney", "Meryl Streep", "Jason Schwartzman", "Bill Murray", "Willem Dafoe"] },
  "moonrise-kingdom": { director: "Wes Anderson", cast: ["Bruce Willis", "Edward Norton", "Bill Murray", "Frances McDormand", "Tilda Swinton", "Jason Schwartzman"] },
  "the-royal-tenenbaums": { director: "Wes Anderson", cast: ["Gene Hackman", "Anjelica Huston", "Ben Stiller", "Gwyneth Paltrow", "Luke Wilson", "Owen Wilson", "Bill Murray"] },
  "asteroid-city": { director: "Wes Anderson", cast: ["Jason Schwartzman", "Scarlett Johansson", "Tom Hanks", "Jeffrey Wright", "Tilda Swinton", "Bryan Cranston", "Edward Norton"] },
  "isle-of-dogs": { director: "Wes Anderson", cast: ["Bryan Cranston", "Koyu Rankin", "Edward Norton", "Bob Balaban", "Bill Murray", "Jeff Goldblum", "Greta Gerwig"] },
  "the-french-dispatch": { director: "Wes Anderson", cast: ["Benicio del Toro", "Adrien Brody", "Tilda Swinton", "Léa Seydoux", "Frances McDormand", "Timothée Chalamet", "Bill Murray"] },

  // Bong Joon-ho
  "parasite": { director: "Bong Joon-ho", cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong", "Choi Woo-shik", "Park So-dam", "Lee Jung-eun"] },
  "memories-of-murder": { director: "Bong Joon-ho", cast: ["Song Kang-ho", "Kim Sang-kyung", "Kim Roe-ha", "Song Jae-ho"] },
  "snowpiercer": { director: "Bong Joon-ho", cast: ["Chris Evans", "Song Kang-ho", "Ed Harris", "John Hurt", "Tilda Swinton", "Jamie Bell", "Octavia Spencer"] },
  "the-host": { director: "Bong Joon-ho", cast: ["Song Kang-ho", "Byun Hee-bong", "Park Hae-il", "Bae Doona"] },

  // Stanley Kubrick
  "2001-a-space-odyssey": { director: "Stanley Kubrick", cast: ["Keir Dullea", "Gary Lockwood", "William Sylvester"] },
  "the-shining": { director: "Stanley Kubrick", cast: ["Jack Nicholson", "Shelley Duvall", "Danny Lloyd", "Scatman Crothers"] },
  "a-clockwork-orange": { director: "Stanley Kubrick", cast: ["Malcolm McDowell", "Patrick Magee", "Michael Bates"] },
  "full-metal-jacket": { director: "Stanley Kubrick", cast: ["Matthew Modine", "Vincent D'Onofrio", "R. Lee Ermey", "Adam Baldwin"] },
  "eyes-wide-shut": { director: "Stanley Kubrick", cast: ["Tom Cruise", "Nicole Kidman", "Sydney Pollack", "Marie Richardson"] },
  "barry-lyndon": { director: "Stanley Kubrick", cast: ["Ryan O'Neal", "Marisa Berenson", "Patrick Magee"] },

  // Paul Thomas Anderson
  "there-will-be-blood": { director: "Paul Thomas Anderson", cast: ["Daniel Day-Lewis", "Paul Dano", "Kevin J. O'Connor", "Ciarán Hinds"] },
  "magnolia": { director: "Paul Thomas Anderson", cast: ["Tom Cruise", "Julianne Moore", "Philip Seymour Hoffman", "John C. Reilly", "William H. Macy"] },
  "boogie-nights": { director: "Paul Thomas Anderson", cast: ["Mark Wahlberg", "Julianne Moore", "Burt Reynolds", "Don Cheadle", "John C. Reilly", "Heather Graham"] },
  "phantom-thread": { director: "Paul Thomas Anderson", cast: ["Daniel Day-Lewis", "Vicky Krieps", "Lesley Manville"] },
  "the-master": { director: "Paul Thomas Anderson", cast: ["Joaquin Phoenix", "Philip Seymour Hoffman", "Amy Adams", "Laura Dern"] },
  "licorice-pizza": { director: "Paul Thomas Anderson", cast: ["Alana Haim", "Cooper Hoffman", "Sean Penn", "Tom Waits", "Bradley Cooper"] },

  // Martin McDonagh
  "in-bruges": { director: "Martin McDonagh", cast: ["Colin Farrell", "Brendan Gleeson", "Ralph Fiennes", "Clémence Poésy"] },
  "three-billboards-outside-ebbing-missouri": { director: "Martin McDonagh", cast: ["Frances McDormand", "Woody Harrelson", "Sam Rockwell", "John Hawkes", "Peter Dinklage"] },
  "the-banshees-of-inisherin": { director: "Martin McDonagh", cast: ["Colin Farrell", "Brendan Gleeson", "Kerry Condon", "Barry Keoghan"] },
  "seven-psychopaths": { director: "Martin McDonagh", cast: ["Colin Farrell", "Sam Rockwell", "Woody Harrelson", "Christopher Walken"] },

  // Steven Spielberg
  "jurassic-park": { director: "Steven Spielberg", cast: ["Sam Neill", "Laura Dern", "Jeff Goldblum", "Richard Attenborough"] },
  "schindlers-list": { director: "Steven Spielberg", cast: ["Liam Neeson", "Ben Kingsley", "Ralph Fiennes", "Caroline Goodall"] },
  "saving-private-ryan": { director: "Steven Spielberg", cast: ["Tom Hanks", "Matt Damon", "Tom Sizemore", "Edward Burns", "Barry Pepper", "Vin Diesel"] },
  "catch-me-if-you-can": { director: "Steven Spielberg", cast: ["Leonardo DiCaprio", "Tom Hanks", "Christopher Walken", "Martin Sheen", "Nathalie Baye", "Amy Adams"] },
  "jaws": { director: "Steven Spielberg", cast: ["Roy Scheider", "Robert Shaw", "Richard Dreyfuss", "Lorraine Gary"] },
  "raiders-of-the-lost-ark": { director: "Steven Spielberg", cast: ["Harrison Ford", "Karen Allen", "Paul Freeman", "John Rhys-Davies"] },

  // James Cameron
  "titanic": { director: "James Cameron", cast: ["Leonardo DiCaprio", "Kate Winslet", "Billy Zane", "Kathy Bates", "Frances Fisher"] },
  "the-terminator": { director: "James Cameron", cast: ["Arnold Schwarzenegger", "Michael Biehn", "Linda Hamilton", "Paul Winfield"] },
  "terminator-2-judgment-day": { director: "James Cameron", cast: ["Arnold Schwarzenegger", "Linda Hamilton", "Edward Furlong", "Robert Patrick"] },
  "avatar": { director: "James Cameron", cast: ["Sam Worthington", "Zoe Saldaña", "Sigourney Weaver", "Stephen Lang", "Michelle Rodriguez"] },
  "avatar-the-way-of-water": { director: "James Cameron", cast: ["Sam Worthington", "Zoe Saldaña", "Sigourney Weaver", "Stephen Lang", "Kate Winslet"] },
  "aliens": { director: "James Cameron", cast: ["Sigourney Weaver", "Michael Biehn", "Carrie Henn", "Paul Reiser", "Bill Paxton"] },

  // Ridley Scott
  "blade-runner": { director: "Ridley Scott", cast: ["Harrison Ford", "Rutger Hauer", "Sean Young", "Edward James Olmos"] },
  "alien": { director: "Ridley Scott", cast: ["Sigourney Weaver", "Tom Skerritt", "John Hurt", "Veronica Cartwright", "Harry Dean Stanton"] },
  "gladiator": { director: "Ridley Scott", cast: ["Russell Crowe", "Joaquin Phoenix", "Connie Nielsen", "Oliver Reed", "Richard Harris"] },
  "the-martian": { director: "Ridley Scott", cast: ["Matt Damon", "Jessica Chastain", "Kristen Wiig", "Jeff Daniels", "Michael Peña", "Chiwetel Ejiofor"] },

  // Coen Brothers
  "no-country-for-old-men": { director: "Ethan Coen & Joel Coen", cast: ["Tommy Lee Jones", "Javier Bardem", "Josh Brolin", "Woody Harrelson", "Kelly Macdonald"] },
  "the-big-lebowski": { director: "Joel Coen", cast: ["Jeff Bridges", "John Goodman", "Julianne Moore", "Steve Buscemi", "David Huddleston", "John Turturro"] },
  "fargo": { director: "Joel Coen", cast: ["Frances McDormand", "William H. Macy", "Steve Buscemi", "Peter Stormare", "Harve Presnell"] },

  // Francis Ford Coppola
  "the-godfather": { director: "Francis Ford Coppola", cast: ["Marlon Brando", "Al Pacino", "James Caan", "Robert Duvall", "Diane Keaton"] },
  "the-godfather-part-ii": { director: "Francis Ford Coppola", cast: ["Al Pacino", "Robert De Niro", "Robert Duvall", "Diane Keaton", "John Cazale"] },
  "apocalypse-now": { director: "Francis Ford Coppola", cast: ["Martin Sheen", "Marlon Brando", "Robert Duvall", "Frederic Forrest", "Laurence Fishburne"] },

  // Robert Eggers, Ari Aster & Jordan Peele
  "the-witch": { director: "Robert Eggers", cast: ["Anya Taylor-Joy", "Ralph Ineson", "Kate Dickie", "Harvey Scrimshaw"] },
  "the-lighthouse": { director: "Robert Eggers", cast: ["Willem Dafoe", "Robert Pattinson", "Valeriia Karaman"] },
  "the-northman": { director: "Robert Eggers", cast: ["Alexander Skarsgård", "Nicole Kidman", "Claes Bang", "Anya Taylor-Joy", "Ethan Hawke", "Willem Dafoe"] },
  "hereditary": { director: "Ari Aster", cast: ["Toni Collette", "Alex Wolff", "Milly Shapiro", "Ann Dowd", "Gabriel Byrne"] },
  "midsommar": { director: "Ari Aster", cast: ["Florence Pugh", "Jack Reynor", "William Jackson Harper", "Vilhelm Blomgren", "Will Poulter"] },
  "get-out": { director: "Jordan Peele", cast: ["Daniel Kaluuya", "Allison Williams", "Bradley Whitford", "Catherine Keener", "Caleb Landry Jones", "Lil Rel Howery"] },
  "us": { director: "Jordan Peele", cast: ["Lupita Nyong'o", "Winston Duke", "Elisabeth Moss", "Tim Heidecker"] },
  "nope": { director: "Jordan Peele", cast: ["Daniel Kaluuya", "Keke Palmer", "Steven Yeun", "Michael Wincott", "Brandon Perea"] },

  // Park Chan-wook
  "oldboy": { director: "Park Chan-wook", cast: ["Choi Min-sik", "Yoo Ji-tae", "Kang Hye-jung", "Kim Byeong-ok"] },
  "the-handmaiden": { director: "Park Chan-wook", cast: ["Kim Min-hee", "Kim Tae-ri", "Ha Jung-woo", "Cho Jin-woong"] },
  "decision-to-leave": { director: "Park Chan-wook", cast: ["Tang Wei", "Park Hae-il", "Lee Jung-hyun", "Go Kyung-pyo"] },

  // Jonathan Glazer, Celine Song, Sean Baker
  "the-zone-of-interest": { director: "Jonathan Glazer", cast: ["Christian Friedel", "Sandra Hüller", "Johann Karthaus"] },
  "under-the-skin": { director: "Jonathan Glazer", cast: ["Scarlett Johansson", "Jeremy McWilliams", "Lynsey Taylor Mackay"] },
  "past-lives": { director: "Celine Song", cast: ["Greta Lee", "Teo Yoo", "John Magaro"] },
  "the-florida-project": { director: "Sean Baker", cast: ["Brooklynn Prince", "Bria Vinaite", "Willem Dafoe", "Valeria Cotto"] },
  "anora": { director: "Sean Baker", cast: ["Mikey Madison", "Mark Eydelshteyn", "Yura Borisov", "Karren Karagulian"] },

  // Hayao Miyazaki
  "spirited-away": { director: "Hayao Miyazaki", cast: ["Rumi Hiiragi", "Miyu Irino", "Mari Natsuki"] },
  "princess-mononoke": { director: "Hayao Miyazaki", cast: ["Yōji Matsuda", "Yuriko Ishida", "Yūko Tanaka"] },
  "howls-moving-castle": { director: "Hayao Miyazaki", cast: ["Chieko Baisho", "Takuya Kimura", "Akihiro Miwa"] },
  "my-neighbor-totoro": { director: "Hayao Miyazaki", cast: ["Noriko Hidaka", "Chika Sakamoto", "Shigesato Itoi"] },
  "the-boy-and-the-heron": { director: "Hayao Miyazaki", cast: ["Soma Santoki", "Masaki Suda", "Kou Shibasaki", "Aimyon"] },

  // Peter Jackson
  "the-lord-of-the-rings-the-fellowship-of-the-ring": { director: "Peter Jackson", cast: ["Elijah Wood", "Ian McKellen", "Viggo Mortensen", "Sean Astin", "Orlando Bloom", "John Rhys-Davies"] },
  "the-lord-of-the-rings-the-two-towers": { director: "Peter Jackson", cast: ["Elijah Wood", "Ian McKellen", "Viggo Mortensen", "Sean Astin", "Andy Serkis", "Orlando Bloom"] },
  "the-lord-of-the-rings-the-return-of-the-king": { director: "Peter Jackson", cast: ["Elijah Wood", "Ian McKellen", "Viggo Mortensen", "Sean Astin", "Andy Serkis", "Bernard Hill"] },

  // Todd Phillips, Sam Mendes, George Miller
  "joker": { director: "Todd Phillips", cast: ["Joaquin Phoenix", "Robert De Niro", "Zazie Beetz", "Frances Conroy", "Brett Cullen"] },
  "1917": { director: "Sam Mendes", cast: ["George MacKay", "Dean-Charles Chapman", "Mark Strong", "Andrew Scott", "Richard Madden", "Colin Firth", "Benedict Cumberbatch"] },
  "american-beauty": { director: "Sam Mendes", cast: ["Kevin Spacey", "Annette Bening", "Thora Birch", "Wes Bentley", "Mena Suvari", "Chris Cooper"] },
  "mad-max-fury-road": { director: "George Miller", cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult", "Hugh Keays-Byrne"] },
  "the-matrix": { director: "Lana Wachowski & Lilly Wachowski", cast: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss", "Hugo Weaving", "Joe Pantoliano"] },

  // Darren Aronofsky, David Lynch, Spike Jonze
  "mother": { director: "Darren Aronofsky", cast: ["Jennifer Lawrence", "Javier Bardem", "Ed Harris", "Michelle Pfeiffer", "Domhnall Gleeson", "Brian Gleeson", "Kristen Wiig"] },
  "mother-2017": { director: "Darren Aronofsky", cast: ["Jennifer Lawrence", "Javier Bardem", "Ed Harris", "Michelle Pfeiffer", "Domhnall Gleeson", "Brian Gleeson", "Kristen Wiig"] },
  "black-swan": { director: "Darren Aronofsky", cast: ["Natalie Portman", "Mila Kunis", "Vincent Cassel", "Barbara Hershey", "Winona Ryder"] },
  "requiem-for-a-dream": { director: "Darren Aronofsky", cast: ["Ellen Burstyn", "Jared Leto", "Jennifer Connelly", "Marlon Wayans"] },
  "the-whale": { director: "Darren Aronofsky", cast: ["Brendan Fraser", "Sadie Sink", "Hong Chau", "Ty Simpkins"] },
  "the-fountain": { director: "Darren Aronofsky", cast: ["Hugh Jackman", "Rachel Weisz", "Ellen Burstyn"] },
  "mulholland-drive": { director: "David Lynch", cast: ["Naomi Watts", "Laura Harring", "Justin Theroux", "Ann Miller"] },
  "blue-velvet": { director: "David Lynch", cast: ["Kyle MacLachlan", "Isabella Rossellini", "Dennis Hopper", "Laura Dern"] },
  "her": { director: "Spike Jonze", cast: ["Joaquin Phoenix", "Scarlett Johansson", "Amy Adams", "Rooney Mara", "Olivia Wilde", "Chris Pratt"] },
  "lost-in-translation": { director: "Sofia Coppola", cast: ["Bill Murray", "Scarlett Johansson", "Giovanni Ribisi", "Anna Faris"] },
  "eternal-sunshine-of-the-spotless-mind": { director: "Michel Gondry", cast: ["Jim Carrey", "Kate Winslet", "Kirsten Dunst", "Mark Ruffalo", "Elijah Wood", "Tom Wilkinson"] },

  // Javier Bardem & Classics
  "skyfall": { director: "Sam Mendes", cast: ["Daniel Craig", "Javier Bardem", "Judi Dench", "Ralph Fiennes", "Naomie Harris", "Ben Whishaw"] },
  "vicky-cristina-barcelona": { director: "Woody Allen", cast: ["Javier Bardem", "Penélope Cruz", "Scarlett Johansson", "Rebecca Hall"] },
  "biutiful": { director: "Alejandro G. Iñárritu", cast: ["Javier Bardem", "Maricel Álvarez", "Hanaa Bouchaib"] },
  "the-counselor": { director: "Ridley Scott", cast: ["Michael Fassbender", "Penélope Cruz", "Cameron Diaz", "Javier Bardem", "Brad Pitt"] },

  // Chris Evans & Marvel Cinematic Universe (MCU)
  "captain-america-the-first-avenger": { director: "Joe Johnston", cast: ["Chris Evans", "Hayley Atwell", "Sebastian Stan", "Tommy Lee Jones", "Hugo Weaving", "Dominic Cooper", "Stanley Tucci"] },
  "captain-america-the-first-avenger-2011": { director: "Joe Johnston", cast: ["Chris Evans", "Hayley Atwell", "Sebastian Stan", "Tommy Lee Jones", "Hugo Weaving", "Dominic Cooper", "Stanley Tucci"] },
  "the-avengers": { director: "Joss Whedon", cast: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Chris Hemsworth", "Scarlett Johansson", "Jeremy Renner", "Tom Hiddleston", "Samuel L. Jackson", "Clark Gregg", "Cobie Smulders"] },
  "the-avengers-2012": { director: "Joss Whedon", cast: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Chris Hemsworth", "Scarlett Johansson", "Jeremy Renner", "Tom Hiddleston", "Samuel L. Jackson", "Clark Gregg", "Cobie Smulders"] },
  "marvels-the-avengers": { director: "Joss Whedon", cast: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Chris Hemsworth", "Scarlett Johansson", "Jeremy Renner", "Tom Hiddleston", "Samuel L. Jackson", "Clark Gregg", "Cobie Smulders"] },
  "captain-america-the-winter-soldier": { director: "Anthony Russo & Joe Russo", cast: ["Chris Evans", "Scarlett Johansson", "Sebastian Stan", "Anthony Mackie", "Cobie Smulders", "Frank Grillo", "Emily VanCamp", "Robert Redford", "Samuel L. Jackson"] },
  "captain-america-the-winter-soldier-2014": { director: "Anthony Russo & Joe Russo", cast: ["Chris Evans", "Scarlett Johansson", "Sebastian Stan", "Anthony Mackie", "Cobie Smulders", "Frank Grillo", "Emily VanCamp", "Robert Redford", "Samuel L. Jackson"] },
  "avengers-age-of-ultron": { director: "Joss Whedon", cast: ["Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo", "Chris Evans", "Scarlett Johansson", "Jeremy Renner", "James Spader", "Samuel L. Jackson", "Elizabeth Olsen", "Paul Bettany", "Aaron Taylor-Johnson"] },
  "avengers-age-of-ultron-2015": { director: "Joss Whedon", cast: ["Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo", "Chris Evans", "Scarlett Johansson", "Jeremy Renner", "James Spader", "Samuel L. Jackson", "Elizabeth Olsen", "Paul Bettany", "Aaron Taylor-Johnson"] },
  "captain-america-civil-war": { director: "Anthony Russo & Joe Russo", cast: ["Chris Evans", "Robert Downey Jr.", "Scarlett Johansson", "Sebastian Stan", "Anthony Mackie", "Don Cheadle", "Jeremy Renner", "Chadwick Boseman", "Paul Bettany", "Elizabeth Olsen", "Paul Rudd", "Tom Holland", "Daniel Brühl"] },
  "captain-america-civil-war-2016": { director: "Anthony Russo & Joe Russo", cast: ["Chris Evans", "Robert Downey Jr.", "Scarlett Johansson", "Sebastian Stan", "Anthony Mackie", "Don Cheadle", "Jeremy Renner", "Chadwick Boseman", "Paul Bettany", "Elizabeth Olsen", "Paul Rudd", "Tom Holland", "Daniel Brühl"] },
  "avengers-infinity-war": { director: "Anthony Russo & Joe Russo", cast: ["Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo", "Chris Evans", "Scarlett Johansson", "Benedict Cumberbatch", "Don Cheadle", "Tom Holland", "Chadwick Boseman", "Paul Bettany", "Elizabeth Olsen", "Anthony Mackie", "Sebastian Stan", "Danai Gurira", "Letitia Wright", "Dave Bautista", "Zoe Saldaña", "Josh Brolin", "Chris Pratt", "Karen Gillan"] },
  "avengers-infinity-war-2018": { director: "Anthony Russo & Joe Russo", cast: ["Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo", "Chris Evans", "Scarlett Johansson", "Benedict Cumberbatch", "Don Cheadle", "Tom Holland", "Chadwick Boseman", "Paul Bettany", "Elizabeth Olsen", "Anthony Mackie", "Sebastian Stan", "Danai Gurira", "Letitia Wright", "Dave Bautista", "Zoe Saldaña", "Josh Brolin", "Chris Pratt", "Karen Gillan"] },
  "avengers-endgame": { director: "Anthony Russo & Joe Russo", cast: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Chris Hemsworth", "Scarlett Johansson", "Jeremy Renner", "Don Cheadle", "Paul Rudd", "Brie Larson", "Karen Gillan", "Danai Gurira", "Bradley Cooper", "Josh Brolin", "Gwyneth Paltrow"] },
  "avengers-endgame-2019": { director: "Anthony Russo & Joe Russo", cast: ["Robert Downey Jr.", "Chris Evans", "Mark Ruffalo", "Chris Hemsworth", "Scarlett Johansson", "Jeremy Renner", "Don Cheadle", "Paul Rudd", "Brie Larson", "Karen Gillan", "Danai Gurira", "Bradley Cooper", "Josh Brolin", "Gwyneth Paltrow"] },
  "knives-out": { director: "Rian Johnson", cast: ["Daniel Craig", "Chris Evans", "Ana de Armas", "Jamie Lee Curtis", "Michael Shannon", "Don Johnson", "Toni Collette", "LaKeith Stanfield", "Christopher Plummer"] },
  "knives-out-2019": { director: "Rian Johnson", cast: ["Daniel Craig", "Chris Evans", "Ana de Armas", "Jamie Lee Curtis", "Michael Shannon", "Don Johnson", "Toni Collette", "LaKeith Stanfield", "Christopher Plummer"] },
  "scott-pilgrim-vs-the-world": { director: "Edgar Wright", cast: ["Michael Cera", "Mary Elizabeth Winstead", "Kieran Culkin", "Chris Evans", "Anna Kendrick", "Brie Larson", "Aubrey Plaza", "Alison Pill"] },
  "gifted": { director: "Marc Webb", cast: ["Chris Evans", "Mckenna Grace", "Lindsay Duncan", "Jenny Slate", "Octavia Spencer"] },
  "gifted-2017": { director: "Marc Webb", cast: ["Chris Evans", "Mckenna Grace", "Lindsay Duncan", "Jenny Slate", "Octavia Spencer"] },
  "the-gray-man": { director: "Anthony Russo & Joe Russo", cast: ["Ryan Gosling", "Chris Evans", "Ana de Armas", "Jessica Henwick", "Regé-Jean Page", "Wagner Moura", "Dhanush", "Billy Bob Thornton"] },
  "ghosted": { director: "Dexter Fletcher", cast: ["Chris Evans", "Ana de Armas", "Adrien Brody", "Mike Moh"] },
  "red-one": { director: "Jake Kasdan", cast: ["Dwayne Johnson", "Chris Evans", "J.K. Simmons", "Bonnie Hunt"] },
  "deadpool-and-wolverine": { director: "Shawn Levy", cast: ["Ryan Reynolds", "Hugh Jackman", "Emma Corrin", "Matthew Macfadyen", "Chris Evans", "Dafne Keen", "Channing Tatum", "Wesley Snipes", "Jennifer Garner"] },
  "deadpool-wolverine": { director: "Shawn Levy", cast: ["Ryan Reynolds", "Hugh Jackman", "Emma Corrin", "Matthew Macfadyen", "Chris Evans", "Dafne Keen", "Channing Tatum", "Wesley Snipes", "Jennifer Garner"] },
  "sunshine": { director: "Danny Boyle", cast: ["Cillian Murphy", "Chris Evans", "Rose Byrne", "Michelle Yeoh", "Cliff Curtis", "Hiroyuki Sanada", "Benedict Wong", "Mark Strong"] },
  "fantastic-four": { director: "Tim Story", cast: ["Ioan Gruffudd", "Jessica Alba", "Chris Evans", "Michael Chiklis", "Julian McMahon"] },
  "fantastic-four-rise-of-the-silver-surfer": { director: "Tim Story", cast: ["Ioan Gruffudd", "Jessica Alba", "Chris Evans", "Michael Chiklis", "Doug Jones", "Laurence Fishburne"] },

  // MCU Standalones & Other Marvel
  "iron-man": { director: "Jon Favreau", cast: ["Robert Downey Jr.", "Terrence Howard", "Jeff Bridges", "Gwyneth Paltrow"] },
  "iron-man-2": { director: "Jon Favreau", cast: ["Robert Downey Jr.", "Gwyneth Paltrow", "Don Cheadle", "Scarlett Johansson", "Sam Rockwell", "Mickey Rourke", "Samuel L. Jackson"] },
  "iron-man-3": { director: "Shane Black", cast: ["Robert Downey Jr.", "Gwyneth Paltrow", "Don Cheadle", "Guy Pearce", "Rebecca Hall", "Ben Kingsley"] },
  "thor": { director: "Kenneth Branagh", cast: ["Chris Hemsworth", "Natalie Portman", "Tom Hiddleston", "Stellan Skarsgård", "Anthony Hopkins", "Idris Elba"] },
  "thor-ragnarok": { director: "Taika Waititi", cast: ["Chris Hemsworth", "Tom Hiddleston", "Cate Blanchett", "Idris Elba", "Jeff Goldblum", "Tessa Thompson", "Karl Urban", "Mark Ruffalo", "Anthony Hopkins"] },
  "black-panther": { director: "Ryan Coogler", cast: ["Chadwick Boseman", "Michael B. Jordan", "Lupita Nyong'o", "Danai Gurira", "Martin Freeman", "Daniel Kaluuya", "Letitia Wright", "Winston Duke", "Angela Bassett", "Forest Whitaker", "Andy Serkis"] },
  "spider-man-homecoming": { director: "Jon Watts", cast: ["Tom Holland", "Michael Keaton", "Robert Downey Jr.", "Marisa Tomei", "Jon Favreau", "Zendaya", "Donald Glover", "Jacob Batalon"] },
  "spider-man-far-from-home": { director: "Jon Watts", cast: ["Tom Holland", "Samuel L. Jackson", "Zendaya", "Cobie Smulders", "Jon Favreau", "J.B. Smoove", "Jacob Batalon", "Martin Starr", "Marisa Tomei", "Jake Gyllenhaal"] },
  "spider-man-no-way-home": { director: "Jon Watts", cast: ["Tom Holland", "Zendaya", "Benedict Cumberbatch", "Jacob Batalon", "Jon Favreau", "Jamie Foxx", "Willem Dafoe", "Alfred Molina", "Andrew Garfield", "Tobey Maguire"] },
  "guardians-of-the-galaxy": { director: "James Gunn", cast: ["Chris Pratt", "Zoe Saldaña", "Dave Bautista", "Vin Diesel", "Bradley Cooper", "Lee Pace", "Michael Rooker", "Karen Gillan"] },
  "guardians-of-the-galaxy-vol-2": { director: "James Gunn", cast: ["Chris Pratt", "Zoe Saldaña", "Dave Bautista", "Vin Diesel", "Bradley Cooper", "Michael Rooker", "Karen Gillan", "Pom Klementieff", "Sylvester Stallone", "Kurt Russell"] },
  "guardians-of-the-galaxy-vol-3": { director: "James Gunn", cast: ["Chris Pratt", "Zoe Saldaña", "Dave Bautista", "Karen Gillan", "Pom Klementieff", "Vin Diesel", "Bradley Cooper", "Will Poulter", "Sean Gunn"] },

  // Harry Potter Saga
  "harry-potter-and-the-philosophers-stone": { director: "Chris Columbus", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "John Cleese", "Robbie Coltrane", "Richard Harris", "Maggie Smith", "Alan Rickman"] },
  "harry-potter-and-the-chamber-of-secrets": { director: "Chris Columbus", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Kenneth Branagh", "John Cleese", "Robbie Coltrane", "Richard Harris", "Maggie Smith", "Alan Rickman"] },
  "harry-potter-and-the-prisoner-of-azkaban": { director: "Alfonso Cuarón", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Gary Oldman", "Michael Gambon", "Alan Rickman", "David Thewlis", "Maggie Smith"] },
  "harry-potter-and-the-goblet-of-fire": { director: "Mike Newell", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Ralph Fiennes", "Michael Gambon", "Brendan Gleeson", "Robert Pattinson", "Alan Rickman"] },
  "harry-potter-and-the-order-of-the-phoenix": { director: "David Yates", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Helena Bonham Carter", "Ralph Fiennes", "Michael Gambon", "Gary Oldman", "Alan Rickman"] },
  "harry-potter-and-the-half-blood-prince": { director: "David Yates", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Jim Broadbent", "Helena Bonham Carter", "Michael Gambon", "Alan Rickman", "Tom Felton"] },
  "harry-potter-and-the-deathly-hallows-part-1": { director: "David Yates", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Helena Bonham Carter", "Ralph Fiennes", "Alan Rickman", "Bill Nighy"] },
  "harry-potter-and-the-deathly-hallows-part-2": { director: "David Yates", cast: ["Daniel Radcliffe", "Rupert Grint", "Emma Watson", "Helena Bonham Carter", "Ralph Fiennes", "Michael Gambon", "Alan Rickman", "Maggie Smith"] },

  // Star Wars Saga
  "star-wars": { director: "George Lucas", cast: ["Mark Hamill", "Harrison Ford", "Carrie Fisher", "Peter Cushing", "Alec Guinness"] },
  "the-empire-strikes-back": { director: "Irvin Kershner", cast: ["Mark Hamill", "Harrison Ford", "Carrie Fisher", "Billy Dee Williams", "Anthony Daniels", "Frank Oz"] },
  "return-of-the-jedi": { director: "Richard Marquand", cast: ["Mark Hamill", "Harrison Ford", "Carrie Fisher", "Billy Dee Williams", "Anthony Daniels", "Ian McDiarmid"] },
  "star-wars-the-force-awakens": { director: "J.J. Abrams", cast: ["Harrison Ford", "Mark Hamill", "Carrie Fisher", "Adam Driver", "Daisy Ridley", "John Boyega", "Oscar Isaac", "Lupita Nyong'o", "Domhnall Gleeson"] },
  "star-wars-the-last-jedi": { director: "Rian Johnson", cast: ["Mark Hamill", "Carrie Fisher", "Adam Driver", "Daisy Ridley", "John Boyega", "Oscar Isaac", "Andy Serkis", "Lupita Nyong'o", "Domhnall Gleeson", "Benicio del Toro"] },
  "star-wars-the-rise-of-skywalker": { director: "J.J. Abrams", cast: ["Carrie Fisher", "Mark Hamill", "Adam Driver", "Daisy Ridley", "John Boyega", "Oscar Isaac", "Anthony Daniels", "Ian McDiarmid"] },
  "rogue-one-a-star-wars-story": { director: "Gareth Edwards", cast: ["Felicity Jones", "Diego Luna", "Ben Mendelsohn", "Donnie Yen", "Mads Mikkelsen", "Alan Tudyk", "Riz Ahmed", "Forest Whitaker"] },

  // Mission: Impossible Series
  "mission-impossible": { director: "Brian De Palma", cast: ["Tom Cruise", "Jon Voight", "Emmanuelle Béart", "Henry Czerny", "Jean Reno", "Ving Rhames"] },
  "mission-impossible-ii": { director: "John Woo", cast: ["Tom Cruise", "Dougray Scott", "Thandiwe Newton", "Ving Rhames", "Richard Roxburgh"] },
  "mission-impossible-iii": { director: "J.J. Abrams", cast: ["Tom Cruise", "Philip Seymour Hoffman", "Ving Rhames", "Billy Crudup", "Michelle Monaghan", "Jonathan Rhys Meyers", "Keri Russell", "Laurence Fishburne"] },
  "mission-impossible-ghost-protocol": { director: "Brad Bird", cast: ["Tom Cruise", "Paula Patton", "Simon Pegg", "Jeremy Renner", "Michael Nyqvist", "Léa Seydoux"] },
  "mission-impossible-rogue-nation": { director: "Christopher McQuarrie", cast: ["Tom Cruise", "Jeremy Renner", "Simon Pegg", "Rebecca Ferguson", "Ving Rhames", "Sean Harris", "Alec Baldwin"] },
  "mission-impossible-fallout": { director: "Christopher McQuarrie", cast: ["Tom Cruise", "Henry Cavill", "Ving Rhames", "Simon Pegg", "Rebecca Ferguson", "Sean Harris", "Angela Bassett", "Vanessa Kirby", "Michelle Monaghan", "Alec Baldwin"] },
  "mission-impossible-dead-reckoning-part-one": { director: "Christopher McQuarrie", cast: ["Tom Cruise", "Hayley Atwell", "Ving Rhames", "Simon Pegg", "Rebecca Ferguson", "Vanessa Kirby", "Esai Morales", "Pom Klementieff", "Henry Czerny"] },

  // Turkish Cinema Classics
  "kis-uykusu": { director: "Nuri Bilge Ceylan", cast: ["Haluk Bilginer", "Demet Akbağ", "Melisa Sözen", "Ayberk Pekcan"] },
  "bir-zamanlar-anadoluda": { director: "Nuri Bilge Ceylan", cast: ["Muhammet Uzuner", "Yılmaz Erdoğan", "Taner Birsel", "Ahmet Mümtaz Taylan", "Fırat Tanış"] },
  "ahlat-agaci": { director: "Nuri Bilge Ceylan", cast: ["Doğu Demirkol", "Murat Cemcir", "Bennu Yıldırımlar", "Hazar Ergüçlü"] },
  "kuru-otlar-ustune": { director: "Nuri Bilge Ceylan", cast: ["Deniz Celiloğlu", "Merve Dizdar", "Musab Ekici", "Ece Bağcı"] },
  "kader": { director: "Zeki Demirkubuz", cast: ["Vildan Atasever", "Ufuk Bayraktar", "Engin Akyürek", "Müge Ulusoy", "Erkan Can"] },
  "masumiyet": { director: "Zeki Demirkubuz", cast: ["Haluk Bilginer", "Derya Alabora", "Güven Kıraç", "Yalçın Çakır"] },
  "yeralti": { director: "Zeki Demirkubuz", cast: ["Engin Günaydın", "Serhat Tutumluer", "Nihal Yalçın", "Murat Cemcir"] },

  // Pixar, Animation & Tom Hanks Classics
  "toy-story": { director: "John Lasseter", cast: ["Tom Hanks", "Tim Allen", "Don Rickles", "Jim Varney", "Wallace Shawn", "John Ratzenberger", "Annie Potts"] },
  "toy-story-1995": { director: "John Lasseter", cast: ["Tom Hanks", "Tim Allen", "Don Rickles", "Jim Varney", "Wallace Shawn", "John Ratzenberger", "Annie Potts"] },
  "toy-story-2": { director: "John Lasseter", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack", "Kelsey Grammer", "Don Rickles", "Jim Varney", "Wallace Shawn", "John Ratzenberger", "Annie Potts"] },
  "toy-story-2-1999": { director: "John Lasseter", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack", "Kelsey Grammer", "Don Rickles", "Jim Varney", "Wallace Shawn", "John Ratzenberger", "Annie Potts"] },
  "toy-story-3": { director: "Lee Unkrich", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack", "Ned Beatty", "Don Rickles", "Michael Keaton", "Wallace Shawn", "John Ratzenberger"] },
  "toy-story-3-2010": { director: "Lee Unkrich", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack", "Ned Beatty", "Don Rickles", "Michael Keaton", "Wallace Shawn", "John Ratzenberger"] },
  "toy-story-4": { director: "Josh Cooley", cast: ["Tom Hanks", "Tim Allen", "Annie Potts", "Tony Hale", "Keegan-Michael Key", "Jordan Peele", "Christina Hendricks", "Keanu Reeves"] },
  "toy-story-4-2019": { director: "Josh Cooley", cast: ["Tom Hanks", "Tim Allen", "Annie Potts", "Tony Hale", "Keegan-Michael Key", "Jordan Peele", "Christina Hendricks", "Keanu Reeves"] },
  "toy-story-of-terror": { director: "Angus MacLane", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack", "Carl Weathers", "Stephen Tobolowsky"] },
  "toy-story-that-time-forgot": { director: "Steve Purcell", cast: ["Tom Hanks", "Tim Allen", "Kristen Schaal", "Kevin McKidd"] },
  "hawaiian-vacation": { director: "Gary Rydstrom", cast: ["Tom Hanks", "Tim Allen", "Joan Cusack"] },
  "cast-away": { director: "Robert Zemeckis", cast: ["Tom Hanks", "Helen Hunt", "Nick Searcy", "Chris Noth"] },
  "apollo-13": { director: "Ron Howard", cast: ["Tom Hanks", "Bill Paxton", "Kevin Bacon", "Gary Sinise", "Ed Harris", "Kathleen Quinlan"] },
  "the-polar-express": { director: "Robert Zemeckis", cast: ["Tom Hanks", "Leslie Zemeckis", "Eddie Deezen", "Nona Gaye"] },
  "the-terminal": { director: "Steven Spielberg", cast: ["Tom Hanks", "Catherine Zeta-Jones", "Stanley Tucci", "Chi McBride", "Diego Luna"] },
  "philadelphia": { director: "Jonathan Demme", cast: ["Tom Hanks", "Denzel Washington", "Antonio Banderas", "Jason Robards"] },
  "sleepless-in-seattle": { director: "Nora Ephron", cast: ["Tom Hanks", "Meg Ryan", "Bill Pullman", "Ross Malinger"] },
  "youve-got-mail": { director: "Nora Ephron", cast: ["Tom Hanks", "Meg Ryan", "Greg Kinnear", "Parker Posey"] },
  "sully": { director: "Clint Eastwood", cast: ["Tom Hanks", "Aaron Eckhart", "Laura Linney"] },
  "captain-phillips": { director: "Paul Greengrass", cast: ["Tom Hanks", "Barkhad Abdi", "Barkhad Abdirahman", "Catherine Keener"] },
  "bridge-of-spies": { director: "Steven Spielberg", cast: ["Tom Hanks", "Mark Rylance", "Amy Ryan", "Alan Alda"] },
  "a-man-called-otto": { director: "Marc Forster", cast: ["Tom Hanks", "Mariana Treviño", "Rachel Keller", "Manuel Garcia-Rulfo"] },
  "finding-nemo": { director: "Andrew Stanton", cast: ["Albert Brooks", "Ellen DeGeneres", "Alexander Gould", "Willem Dafoe"] },
  "finding-dory": { director: "Andrew Stanton", cast: ["Ellen DeGeneres", "Albert Brooks", "Ed O'Neill", "Kaitlin Olson"] },
  "the-incredibles": { director: "Brad Bird", cast: ["Craig T. Nelson", "Holly Hunter", "Samuel L. Jackson", "Jason Lee"] },
  "incredibles-2": { director: "Brad Bird", cast: ["Craig T. Nelson", "Holly Hunter", "Sarah Vowell", "Huck Milner", "Samuel L. Jackson"] },
  "monsters-inc": { director: "Pete Docter", cast: ["John Goodman", "Billy Crystal", "Mary Gibbs", "Steve Buscemi", "James Coburn"] },
  "monsters-university": { director: "Dan Scanlon", cast: ["Billy Crystal", "John Goodman", "Steve Buscemi", "Helen Mirren"] },
  "up": { director: "Pete Docter", cast: ["Ed Asner", "Christopher Plummer", "Jordan Nagai", "Bob Peterson"] },
  "wall-e": { director: "Andrew Stanton", cast: ["Ben Burtt", "Elissa Knight", "Jeff Garlin", "Fred Willard"] },
  "ratatouille": { director: "Brad Bird", cast: ["Patton Oswalt", "Ian Holm", "Lou Romano", "Brian Dennehy", "Peter Sohn"] },
  "coco": { director: "Lee Unkrich", cast: ["Anthony Gonzalez", "Gael García Bernal", "Benjamin Bratt", "Alanna Ubach"] },
  "inside-out": { director: "Pete Docter", cast: ["Amy Poehler", "Phyllis Smith", "Richard Kind", "Bill Hader", "Lewis Black", "Mindy Kaling"] },
  "inside-out-2": { director: "Kelsey Mann", cast: ["Amy Poehler", "Maya Hawke", "Kensington Tallman", "Liza Lapira", "Tony Hale", "Lewis Black", "Phyllis Smith", "Ayo Edebiri"] },

  // All-time Cinema Classics & Fan Favorites
  "the-shawshank-redemption": { director: "Frank Darabont", cast: ["Tim Robbins", "Morgan Freeman", "Bob Gunton", "William Sadler", "Clancy Brown"] },
  "the-green-mile": { director: "Frank Darabont", cast: ["Tom Hanks", "David Morse", "Bonnie Hunt", "Michael Clarke Duncan", "James Cromwell", "Sam Rockwell"] },
  "forrest-gump": { director: "Robert Zemeckis", cast: ["Tom Hanks", "Robin Wright", "Gary Sinise", "Mykelti Williamson", "Sally Field"] },
  "the-silence-of-the-lambs": { director: "Jonathan Demme", cast: ["Jodie Foster", "Anthony Hopkins", "Scott Glenn", "Ted Levine"] },
  "heat": { director: "Michael Mann", cast: ["Al Pacino", "Robert De Niro", "Val Kilmer", "Jon Voight", "Tom Sizemore"] },
  "scarface": { director: "Brian De Palma", cast: ["Al Pacino", "Steven Bauer", "Michelle Pfeiffer", "Mary Elizabeth Mastrantonio", "Robert Loggia"] },
  "good-will-hunting": { director: "Gus Van Sant", cast: ["Robin Williams", "Matt Damon", "Ben Affleck", "Stellan Skarsgård", "Minnie Driver"] },
  "american-psycho": { director: "Mary Harron", cast: ["Christian Bale", "Willem Dafoe", "Jared Leto", "Josh Lucas", "Chloë Sevigny", "Reese Witherspoon"] },
  "snatch": { director: "Guy Ritchie", cast: ["Jason Statham", "Brad Pitt", "Benicio del Toro", "Stephen Graham", "Alan Ford"] },
  "moneyball": { director: "Bennett Miller", cast: ["Brad Pitt", "Jonah Hill", "Philip Seymour Hoffman", "Robin Wright", "Chris Pratt"] },
  "burn-after-reading": { director: "Ethan Coen & Joel Coen", cast: ["George Clooney", "Frances McDormand", "Brad Pitt", "John Malkovich", "Tilda Swinton"] },
  "troy": { director: "Wolfgang Petersen", cast: ["Brad Pitt", "Eric Bana", "Orlando Bloom", "Diane Kruger", "Brian Cox", "Sean Bean"] },
  "oceans-eleven": { director: "Steven Soderbergh", cast: ["George Clooney", "Matt Damon", "Andy Garcia", "Brad Pitt", "Julia Roberts", "Casey Affleck"] },
  "bullet-train": { director: "David Leitch", cast: ["Brad Pitt", "Joey King", "Aaron Taylor-Johnson", "Brian Tyree Henry", "Andrew Koji", "Sandra Bullock"] },
  "ad-astra": { director: "James Gray", cast: ["Brad Pitt", "Tommy Lee Jones", "Ruth Negga", "Donald Sutherland"] },
  "12-monkeys": { director: "Terry Gilliam", cast: ["Bruce Willis", "Madeleine Stowe", "Brad Pitt", "Christopher Plummer"] },
  "nightcrawler": { director: "Dan Gilroy", cast: ["Jake Gyllenhaal", "Rene Russo", "Riz Ahmed", "Bill Paxton"] },
  "donnie-darko": { director: "Richard Kelly", cast: ["Jake Gyllenhaal", "Jena Malone", "Drew Barrymore", "Maggie Gyllenhaal", "Patrick Swayze"] },
  "primal-fear": { director: "Gregory Hoblit", cast: ["Richard Gere", "Laura Linney", "John Mahoney", "Alfre Woodard", "Edward Norton"] },
  "american-history-x": { director: "Tony Kaye", cast: ["Edward Norton", "Edward Furlong", "Beverly D'Angelo", "Avery Brooks", "Fairuza Balk"] },
  "the-revenant": { director: "Alejandro G. Iñárritu", cast: ["Leonardo DiCaprio", "Tom Hardy", "Domhnall Gleeson", "Will Poulter"] },
  "the-truman-show": { director: "Peter Weir", cast: ["Jim Carrey", "Laura Linney", "Noah Emmerich", "Natascha McElhone", "Ed Harris"] },
  "top-gun-maverick": { director: "Joseph Kosinski", cast: ["Tom Cruise", "Miles Teller", "Jennifer Connelly", "Jon Hamm", "Glen Powell", "Ed Harris"] },
  "edge-of-tomorrow": { director: "Doug Liman", cast: ["Tom Cruise", "Emily Blunt", "Bill Paxton", "Brendan Gleeson"] },
  "the-batman": { director: "Matt Reeves", cast: ["Robert Pattinson", "Zoë Kravitz", "Paul Dano", "Jeffrey Wright", "John Turturro", "Colin Farrell"] },
  "spider-man-into-the-spider-verse": { director: "Bob Persichetti & Peter Ramsey", cast: ["Shameik Moore", "Jake Johnson", "Hailee Steinfeld", "Mahershala Ali", "Nicolas Cage"] },
  "spider-man-across-the-spider-verse": { director: "Joaquim Dos Santos & Kemp Powers", cast: ["Shameik Moore", "Hailee Steinfeld", "Oscar Isaac", "Daniel Kaluuya", "Jason Schwartzman"] },
};

// Title normalize index for rapid matching
const TITLE_INDEX = new Map<string, MovieCredits>();
for (const [slug, credits] of Object.entries(MOVIE_CREDITS_DATABASE)) {
  let entryYear = credits.year;
  if (!entryYear) {
    const ym = slug.match(/-(\d{4})$/);
    if (ym) {
      const parsed = parseInt(ym[1], 10);
      if (parsed >= 1900 && parsed <= 2030) {
        entryYear = parsed;
      }
    }
  }
  const creditsWithYear: MovieCredits = { ...credits, year: entryYear };

  const normSlug = normalizeMovieKey(slug);
  TITLE_INDEX.set(normSlug, creditsWithYear);
  // Slug to title words
  const words = slug.replace(/-/g, " ");
  TITLE_INDEX.set(normalizeMovieKey(words), creditsWithYear);

  // Yıl ekli slug'ların temiz halini de kaydet (örn: dune-2021 -> dune)
  const cleanSlug = slug.replace(/-\d{4}$/, "");
  if (cleanSlug !== slug) {
    const normClean = normalizeMovieKey(cleanSlug);
    if (!TITLE_INDEX.has(normClean)) {
      TITLE_INDEX.set(normClean, creditsWithYear);
    }
    const cleanWords = cleanSlug.replace(/-/g, " ");
    const normCleanWords = normalizeMovieKey(cleanWords);
    if (!TITLE_INDEX.has(normCleanWords)) {
      TITLE_INDEX.set(normCleanWords, creditsWithYear);
    }
  }
}

/**
 * Belirli bir film için yönetmen ve ana oyuncu kadrosunu tespit eder.
 * Kesin ve yıl uyumlu eşleşme kullanır; isim benzerliği veya alt dize (substring)
 * eşleşmelerine izin vermez (örn: "Drive My Car" -> "Drive", "Baby Driver" -> "Drive" gibi hataları engeller).
 */
export function getMovieCredits(movie: {
  filmTitle: string;
  slug?: string;
  director?: string;
  cast?: string[];
  filmYear?: number;
}): MovieCredits {
  // Hem yönetmen hem oyuncu kadrosu zaten tam ise doğrudan dön
  if (movie.director && movie.cast && movie.cast.length > 0) {
    return {
      director: movie.director,
      cast: movie.cast,
    };
  }

  let dbCredits: MovieCredits | undefined = undefined;

  // Yıl uyumluluğu kontrolü: Eğer iki tarafta da yıl biliniyorsa fark en fazla 1 yıl olmalıdır.
  const isYearCompatible = (targetYear?: number, dbYear?: number): boolean => {
    if (!targetYear || !dbYear) return true;
    return Math.abs(targetYear - dbYear) <= 1;
  };

  // 1. Doğrudan tam slug eşleşmesi (Yıl eki dahil veya hariç, tam slug bazlı)
  if (movie.slug) {
    const rawSlugKey = normalizeMovieKey(movie.slug);
    if (TITLE_INDEX.has(rawSlugKey)) {
      const candidate = TITLE_INDEX.get(rawSlugKey);
      if (candidate && isYearCompatible(movie.filmYear, candidate.year)) {
        dbCredits = candidate;
      }
    }

    if (!dbCredits) {
      const cleanSlug = movie.slug.replace(/-\d{4}$/, "");
      const cleanSlugKey = normalizeMovieKey(cleanSlug);
      if (TITLE_INDEX.has(cleanSlugKey)) {
        const candidate = TITLE_INDEX.get(cleanSlugKey);
        if (candidate && isYearCompatible(movie.filmYear, candidate.year)) {
          dbCredits = candidate;
        }
      }
    }
  }

  // 2. Tam film adı eşleşmesi (YALNIZCA BİREBİR EŞİTLİK, isim benzerliği veya alt dize/substring ASLA kullanılmaz)
  if (!dbCredits && movie.filmTitle) {
    const cleanTitle = (movie.filmTitle || "").replace(/\s*\(\d{4}\)$/, "").trim();
    const titleKey = normalizeMovieKey(cleanTitle);
    if (TITLE_INDEX.has(titleKey)) {
      const candidate = TITLE_INDEX.get(titleKey);
      if (candidate && isYearCompatible(movie.filmYear, candidate.year)) {
        dbCredits = candidate;
      }
    }
  }

  // ÖNEMLİ: 3. Kısmi / Bulanık alt dize (substring / includes) eşleşmesi KESİNLİKLE KALDIRILDI!
  // "Drive My Car" -> "Drive", "Baby Driver" -> "Drive", "Alien: Romulus" -> "Alien",
  // "Blade" -> "Blade Runner" gibi hatalı yönetmen eşleşmelerini önlemek için birebir eşleşme şarttır.

  return {
    director: movie.director || dbCredits?.director,
    cast: (movie.cast && movie.cast.length > 0) ? movie.cast : (dbCredits?.cast || []),
    year: dbCredits?.year,
  };
}

/**
 * Filmin çıkış yılı ve yönetmenini "YYYY - Yönetmen" (örn: "2008 - Christopher Nolan") formatında biçimlendirir.
 */
export function formatMovieYearAndDirector(movie?: {
  filmTitle?: string;
  filmYear?: number;
  director?: string;
  slug?: string;
  cast?: string[];
}): string {
  if (!movie) return "";
  const director = movie.director || (movie.filmTitle ? getMovieCredits(movie as MatchedMovie).director : undefined);
  if (movie.filmYear && director) {
    return `${movie.filmYear} - ${director}`;
  }
  if (movie.filmYear) {
    return `${movie.filmYear}`;
  }
  if (director) {
    return director;
  }
  return "";
}

/**
 * Ortak filmler üzerinden "The Unifying Director" ve "The Unifying Actor" sinerjisini hesaplar.
 * - The Unifying Director: Ortak filmleri en çok tekrar eden (en yüksek sharedFilmsCount) yönetmen. Eşitlikte en yüksek puan ortalaması.
 * - The Unifying Actor: Ortak filmlerde en çok tekrar eden (en yüksek sharedFilmsCount) oyuncu. Eşitlikte en yüksek puan ortalaması.
 */
export function computeCinemaSynergy(sharedMovies: MatchedMovie[]): CinemaSynergyResult {
  const totalSharedFilms = sharedMovies.length;
  if (totalSharedFilms === 0) {
    return {
      unifyingDirector: null,
      unifyingActor: null,
      totalSharedFilms: 0,
      hasReliableDirector: false,
      hasReliableActor: false,
    };
  }

  interface StatCollector {
    name: string;
    ratings: number[];
    filmTitles: string[];
  }

  const directorMap = new Map<string, StatCollector>();
  const actorMap = new Map<string, StatCollector>();

  for (const movie of sharedMovies) {
    const credits = getMovieCredits(movie);

    // Film puanı: İki kullanıcının ortak puan ortalaması ((r1 + r2) / 2)
    let movieScore: number;
    const r1 = movie.user1Rating;
    const r2 = movie.user2Rating;
    if (r1 !== null && r2 !== null && typeof r1 === "number" && typeof r2 === "number" && r1 > 0 && r2 > 0) {
      movieScore = (r1 + r2) / 2;
    } else if (movie.averageRating > 0) {
      movieScore = movie.averageRating;
    } else if (r1 !== null && typeof r1 === "number" && r1 > 0) {
      movieScore = r1;
    } else if (r2 !== null && typeof r2 === "number" && r2 > 0) {
      movieScore = r2;
    } else {
      movieScore = 3.5;
    }

    // Yönetmen kaydı (letterboxd/veritabanı director string)
    if (credits.director) {
      // İkili yönetmenleri (örn: "Joel Coen & Ethan Coen") tek tek ayrıştır
      const directors = credits.director
        .split(/\s*&\s*|\s+and\s+|\s*,\s*/)
        .map((d) => d.trim())
        .filter(Boolean);

      const distinctDirectors = Array.from(new Set(directors));
      for (const dName of distinctDirectors) {
        if (!directorMap.has(dName)) {
          directorMap.set(dName, { name: dName, ratings: [], filmTitles: [] });
        }
        const dStat = directorMap.get(dName)!;
        dStat.ratings.push(movieScore);
        dStat.filmTitles.push(movie.filmTitle);
      }
    }

    // Oyuncu kaydı (aynı filmde aynı oyuncu bir kez sayılır)
    if (credits.cast && credits.cast.length > 0) {
      const distinctCast = Array.from(new Set(credits.cast.map((c) => c.trim()).filter(Boolean)));
      for (const aName of distinctCast) {
        if (!actorMap.has(aName)) {
          actorMap.set(aName, { name: aName, ratings: [], filmTitles: [] });
        }
        const aStat = actorMap.get(aName)!;
        aStat.ratings.push(movieScore);
        aStat.filmTitles.push(movie.filmTitle);
      }
    }
  }

  // 1. Yönetmen hesaplama:
  // KURAL: Ortak filmleri yöneten yönetmenler taranır ve filmleri en çok tekrar eden (en yüksek sharedFilmsCount)
  // yönetmen "The Unifying Director" olarak seçilir. Eşitlik halinde iki kullanıcının ortak puan ortalaması (averageRating) en yüksek olan kazanır.
  const allDirectors: PersonSynergy[] = Array.from(directorMap.values()).map((stat) => {
    const avg = stat.ratings.reduce((acc, r) => acc + r, 0) / stat.ratings.length;
    return {
      name: stat.name,
      role: "director" as const,
      averageRating: Math.round(avg * 10) / 10,
      sharedFilmsCount: stat.ratings.length,
      filmTitles: stat.filmTitles,
    };
  });

  allDirectors.sort((a, b) => {
    // 1. Öncelik: En çok ortak film sayısı (en çok tekrar eden yönetmen)
    if (b.sharedFilmsCount !== a.sharedFilmsCount) {
      return b.sharedFilmsCount - a.sharedFilmsCount;
    }
    // 2. Öncelik: Eşitlik durumunda ortak puan ortalaması en yüksek olan
    if (b.averageRating !== a.averageRating) {
      return b.averageRating - a.averageRating;
    }
    return a.name.localeCompare(b.name, "tr");
  });

  let unifyingDirector: PersonSynergy | null = null;
  let hasReliableDirector = false;

  if (allDirectors.length > 0) {
    unifyingDirector = allDirectors[0];
    hasReliableDirector = unifyingDirector.sharedFilmsCount >= 2;
    if (!hasReliableDirector) {
      unifyingDirector = { ...unifyingDirector, isFallback: true };
    }
  }

  // 2. Oyuncu hesaplama:
  // KURAL: Ortak filmlerde oynayan oyuncular taranır ve ismi en çok tekrar eden (en yüksek sharedFilmsCount)
  // oyuncu "The Unifying Actor" olarak seçilir. Eşitlik halinde ortalama puanı (averageRating) en yüksek olan kazanır.
  const allActors: PersonSynergy[] = Array.from(actorMap.values()).map((stat) => {
    const avg = stat.ratings.reduce((acc, r) => acc + r, 0) / stat.ratings.length;
    return {
      name: stat.name,
      role: "actor" as const,
      averageRating: Math.round(avg * 10) / 10,
      sharedFilmsCount: stat.ratings.length,
      filmTitles: stat.filmTitles,
    };
  });

  allActors.sort((a, b) => {
    // 1. Öncelik: En çok tekrar eden oyuncu (en yüksek ortak film sayısı)
    if (b.sharedFilmsCount !== a.sharedFilmsCount) {
      return b.sharedFilmsCount - a.sharedFilmsCount;
    }
    // 2. Öncelik: Eşitlik durumunda ortak puan ortalaması en yüksek olan
    if (b.averageRating !== a.averageRating) {
      return b.averageRating - a.averageRating;
    }
    return a.name.localeCompare(b.name, "tr");
  });

  let unifyingActor: PersonSynergy | null = null;
  let hasReliableActor = false;

  if (allActors.length > 0) {
    unifyingActor = allActors[0];
    hasReliableActor = unifyingActor.sharedFilmsCount >= 2;
    if (!hasReliableActor) {
      unifyingActor = { ...unifyingActor, isFallback: true };
    }
  }

  return {
    unifyingDirector,
    unifyingActor,
    totalSharedFilms,
    hasReliableDirector,
    hasReliableActor,
  };
}
