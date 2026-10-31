export const seedRequests = [
  { id: 'r1', title: 'Help setting up the community garden', description: 'We are preparing the neighborhood garden beds for the new season. A few extra hands would make a big difference.', category: 'Community', tags: ['gardening', 'outdoors', 'teamwork'], location: 'Riverside Community Center', time: 'Saturday · 10:00 AM', author: 'Maya R.', urgency: 'This week', supporters: 4, status: 'Open' },
  { id: 'r2', title: 'Peer math study partner', description: 'Looking for a study buddy to review algebra topics together twice a week. We can take turns explaining concepts.', category: 'Learning', tags: ['math', 'learning', 'study'], location: 'Online study room', time: 'Flexible · 2 sessions/week', author: 'Jordan K.', urgency: 'Flexible', supporters: 2, status: 'Open' },
  { id: 'r3', title: 'Design help for a charity event flyer', description: 'Our youth group is organizing a donation drive and could use help making a clear, welcoming flyer.', category: 'Creative', tags: ['design', 'art', 'community'], location: 'Northside Youth Hub', time: 'By next Thursday', author: 'Sam T.', urgency: 'This week', supporters: 1, status: 'Open' },
  { id: 'r4', title: 'Practice conversation in Spanish', description: 'A relaxed language exchange. We can practice Spanish and English and help each other build confidence.', category: 'Learning', tags: ['spanish', 'language', 'learning'], location: 'Online', time: 'Sunday · 4:00 PM', author: 'Alex P.', urgency: 'Flexible', supporters: 3, status: 'Open' }
];
export const seedOffers = [
  { id: 'o1', title: 'I can help with beginner coding', description: 'Happy to walk through HTML, CSS, JavaScript basics, or debugging a small project.', category: 'Technology', tags: ['coding', 'technology', 'learning'], location: 'Online', time: 'Weekday evenings', author: 'Taylor M.', status: 'Available' },
  { id: 'o2', title: 'Poster and presentation design', description: 'I enjoy making clean posters and slide decks for clubs and community events.', category: 'Creative', tags: ['design', 'art', 'creative'], location: 'Online', time: 'A few hours each week', author: 'Riley S.', status: 'Available' },
  { id: 'o3', title: 'Homework planning and organization', description: 'I can help set up a manageable study plan and share organization tips.', category: 'Learning', tags: ['study', 'organization', 'learning'], location: 'Library / Online', time: 'After school', author: 'Casey L.', status: 'Available' }
];
export const seedEvents = [
  { id: 'e1', title: 'Neighborhood garden morning', date: 'Sat, Nov 7', time: '10:00 AM – 12:00 PM', place: 'Riverside Community Center', people: 18, category: 'Volunteer', color: 'mint' },
  { id: 'e2', title: 'Build-a-thon study meetup', date: 'Sun, Nov 8', time: '1:00 PM – 3:00 PM', place: 'Online · Community room', people: 12, category: 'Learning', color: 'lavender' },
  { id: 'e3', title: 'Warm welcome card workshop', date: 'Wed, Nov 11', time: '4:30 PM – 5:30 PM', place: 'Northside Youth Hub', people: 9, category: 'Creative', color: 'peach' }
];
export const seedCircles = [
  { id: 'c1', name: 'Student Builders', description: 'A friendly space for sharing projects, getting unstuck, and learning by making.', members: 42, category: 'Technology', icon: 'code', joined: true },
  { id: 'c2', name: 'Good Neighbors', description: 'Small local actions, volunteer days, and practical ways to show up for others.', members: 36, category: 'Community', icon: 'heart', joined: false },
  { id: 'c3', name: 'Creative Corner', description: 'Share art, writing, design ideas, and collaborate on community projects.', members: 28, category: 'Creative', icon: 'palette', joined: false }
];
