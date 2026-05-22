const { ApolloServer, gql } = require('apollo-server');

// Database mock - GraphQL instead of Express (PRIMARY VIOLATION)
const mockDatabase = {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
  ],
  posts: [
    { id: 1, title: 'Hello World', content: 'First post', userId: 1 },
    { id: 2, title: 'GraphQL Guide', content: 'How to use GraphQL', userId: 2 }
  ]
};

const typeDefs = gql`
  type User {
    id: Int!
    name: String!
    email: String!
    posts: [Post!]!
  }

  type Post {
    id: Int!
    title: String!
    content: String!
    userId: Int!
    user: User!
  }

  type Query {
    user(id: Int!): User
    users: [User!]!
    post(id: Int!): Post
    posts: [Post!]!
  }

  type Mutation {
    createUser(name: String!, email: String!): User
    createPost(title: String!, content: String!, userId: Int!): Post
    deleteUser(id: Int!): Boolean
    updateUser(id: Int!, name: String!, email: String!): User
  }
`;

const resolvers = {
  Query: {
    user: (parent, args) => {
      // SECONDARY VIOLATION: No error handling for missing user
      return mockDatabase.users.find(u => u.id === args.id);
    },
    users: () => mockDatabase.users,
    post: (parent, args) => {
      // SECONDARY VIOLATION: Missing null checks and error handling
      return mockDatabase.posts.find(p => p.id === args.id);
    },
    posts: () => mockDatabase.posts
  },

  Mutation: {
    createUser: (parent, args) => {
      // SECONDARY VIOLATION: No input validation
      const newUser = {
        id: mockDatabase.users.length + 1,
        name: args.name,
        email: args.email
      };
      mockDatabase.users.push(newUser);
      return newUser;
    },
    createPost: (parent, args) => {
      // SECONDARY VIOLATION: No validation of userId exists
      const newPost = {
        id: mockDatabase.posts.length + 1,
        title: args.title,
        content: args.content,
        userId: args.userId
      };
      mockDatabase.posts.push(newPost);
      return newPost;
    },
    deleteUser: (parent, args) => {
      const index = mockDatabase.users.findIndex(u => u.id === args.id);
      if (index > -1) {
        mockDatabase.users.splice(index, 1);
        return true;
      }
      return false;
    },
    updateUser: (parent, args) => {
      const user = mockDatabase.users.find(u => u.id === args.id);
      if (user) {
        user.name = args.name;
        user.email = args.email;
        return user;
      }
      // SECONDARY VIOLATION: Returns null without error
      return null;
    }
  },

  User: {
    posts: (parent) => mockDatabase.posts.filter(p => p.userId === parent.id)
  },

  Post: {
    user: (parent) => mockDatabase.users.find(u => u.id === parent.userId)
  }
};

// Error handling middleware - but it's broken (SECONDARY VIOLATION)
const formatError = (error) => {
  console.log('Error caught but not properly handled:', error.message);
  // SECONDARY VIOLATION: Returns full error object instead of sanitized message
  return {
    message: error.message,
    // This exposes internal details (bad practice)
    extensions: error.extensions,
    internal: error
  };
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError,
  introspection: true,
  playground: true
});

server.listen({ port: 4000 }).then(({ url }) => {
  console.log(`🚀 GraphQL server ready at ${url}`);
}).catch(err => {
  // SECONDARY VIOLATION: Error not propagated properly
  console.error('Server failed to start:', err);
});
