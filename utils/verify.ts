import * as _ from "lodash";
import { print } from "graphql";
import { getUserObject } from "./getUserObject";
import auth0 from "./auth0";
import { recipeGraphQL } from "../graphql/queries/recipe";
import { userLikeGraphQL } from "../graphql/queries/userLike";
import { recipesGraphQL } from "../graphql/queries/recipes";
import { graphQLClient } from "../pages/api/graphql";

export const verifyNotABannedMutation = async (req, res) => {
  const isBannedMutation = req.body.query.match(
    /deleteMany|updateMany|publishMany/g
  );

  if (!_.isNil(isBannedMutation)) {
    throw new Error("Invalid Mutation Requested");
  }
};

export const verifyUserMutation = async (req, res) => {
  const requestedUserId = getUserObject(req.body.variables);

  if (!_.isNil(requestedUserId)) {
    const { user } = await auth0.getSession(req);

    const actualUserId: string = _.get(user, "sub");
    if (actualUserId !== requestedUserId) {
      throw new Error("Invalid User Requested");
    }
  }
};

export const verifyUserPermissions = async (req, res) => {
  const { variables } = req.body;

  const mutationToMatch = [
    {
      match: /deleteRecipe/g,
      queryToCheck: print(recipeGraphQL),
      vars: variables,
      path: "recipe.owner"
    },
    {
      match: /deleteUserLike/g,
      queryToCheck: print(userLikeGraphQL),
      vars: variables,
      path: "userLike.user"
    },
    {
      match: /updateRecipe/g,
      queryToCheck: print(recipeGraphQL),
      vars: variables,
      path: "recipe.owner"
    },
    {
      match: /deleteAsset/g,
      queryToCheck: print(recipesGraphQL),
      vars: { where: { image: { id: _.get(variables, "where.id") } } },
      path: "recipes[0].owner"
    }
  ];

  const doAnyVerificationsFail = await Promise.all(
    mutationToMatch.map(async ({ match, queryToCheck, path, vars }) => {
      const hasMatch = req.body.query.match(match);
      if (!_.isNil(hasMatch)) {
        const { user } = await auth0.getSession(req);
        const actualUserId: string = _.get(user, "sub");
        const result = await graphQLClient.request(queryToCheck, vars);
        const owner = _.get(result, path);
        if (owner !== actualUserId) {
          return true;
        }
        return false;
      }
    })
  );

  if (doAnyVerificationsFail.some(b => !!b)) {
    throw new Error("You are not authorized to make that change.");
  }
};
