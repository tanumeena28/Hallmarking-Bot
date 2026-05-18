# Implementation Plan - Fix User Roles & RBAC (Simplified)

This plan covers updating the user roles to match the simplified PDF requirements, removing the `nch_employee` role, and creating a data migration.

## User Review Required

> [!IMPORTANT]
> The `nch_employee` role will be removed completely. Existing users with this role will be migrated to `jeweler`.
> Only `nch_admin` remains for internal access.

## Proposed Changes

### 1. Update Models (`backend/models.py`)
- Define `UserRole` enum with values: `jeweler`, `hallmarking_centre`, `refinery`, `nch_admin`.
- Remove any reference to `nch_employee`.

### 2. Update Registration & Auth (`backend/main.py` or `backend/auth.py`)
- Update `RegisterRequest` schema to include the `role` field (must be one of the 3 external roles).
- Add validation to prevent self-registration as `nch_admin`.
- Update `ROLE_PERMISSIONS` dictionary to reflect the 4 roles.

### 3. Update Bot Prompt (`backend/bot.py`)
- Implement `get_user_context_prompt(user)` with the simplified prompt texts.

### 4. Database Migration
- Create a new Alembic migration file.
- Update existing data: Map `public_user`, `verified_client`, and `nch_employee` to `jeweler`.

## Verification Plan

### Automated Tests
- Verify that registration as `nch_admin` is rejected.
- Verify that permissions are correctly applied based on role.

### Manual Verification
- Register as each allowed role and verify bot responses.
- Verify that old users are migrated correctly.
