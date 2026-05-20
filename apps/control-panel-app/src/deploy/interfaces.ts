export interface EnvSchemaItem {
    key: string;
    required?: boolean;
    defaultValue?: string | number | null;
}

export interface PortSchemaItem {
    key: string;
    required?: boolean;
    defaultValue?: number | null;
}
