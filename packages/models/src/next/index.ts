export enum RouterType {
    APP = 'app',
    PAGES = 'pages',
    /** Expo Router (React Native). Routes live in `app/` or `src/app/`, the root layout is `_layout`. */
    EXPO = 'expo',
}

export type RouterConfig = {
    type: RouterType;
    basePath: string;
};
