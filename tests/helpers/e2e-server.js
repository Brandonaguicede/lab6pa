const createApp = require('../../chat-server');

const auth = {
  getUser: () => ({ sub: 'test|browser', name: 'Tester', email: 'tester@example.com' }),
  login: (req, res) => res.redirect('/chat'),
  callback: (req, res) => res.redirect('/chat'),
  logout: (req, res) => res.redirect('/')
};

createApp({ auth }).http.listen(3000);
