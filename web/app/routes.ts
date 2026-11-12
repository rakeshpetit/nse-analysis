import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("companies/:symbol", "routes/company.tsx"),
] satisfies RouteConfig;
