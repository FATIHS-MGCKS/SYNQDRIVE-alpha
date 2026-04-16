/**
 * Shared DTO base classes and validators for SynqDrive.
 *
 * All DTOs use class-validator decorators so the global ValidationPipe
 * (`whitelist: true`, `forbidNonWhitelisted: true`) rejects unknown fields
 * and validates inputs before any handler code runs.
 */
export { IsEmail, IsString, IsOptional, IsBoolean, IsNumber, IsEnum, IsUUID, IsDateString, MinLength, MaxLength, IsArray, ValidateNested, Min, Max, IsPositive, IsInt } from 'class-validator';
export { Type } from 'class-transformer';
