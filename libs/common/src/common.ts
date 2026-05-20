/**
 * Common DTOs and Types
 */

/**
 * Pagination DTO
 */
export interface PaginationDto {
    page: number;
    limit: number;
    total?: number;
    totalPages?: number;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
    data: T[];
    pagination: PaginationDto;
}

/**
 * API Response
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}
