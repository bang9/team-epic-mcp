# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Run the MCP server in development mode with tsx for live reloading
- `npm run build` - Build production bundle with esbuild (outputs minified dist/team-epic-mcp.min.js with shebang)
- `npm run typecheck` - Run TypeScript type checking without emitting files (use before committing)
- `npm run lint` - Run ESLint on all TypeScript files in src/ directory

## Architecture Overview

This is a Model Context Protocol (MCP) server for team epic tracking through Google Sheets integration. The server provides natural language interaction with project management data.

### Core Architecture

- **MCP Server** (`src/index.ts`): Entry point using @modelcontextprotocol/sdk with stdio transport
- **Tool-based Pattern**: Separate read and write tool sets with different data access patterns
- **Google Sheets Integration**: Dual-mode authentication (service account vs read-only)
- **Caching Layer**: In-memory cache with timestamp-based invalidation
- **Automatic Migration System**: Version-based schema migrations (v1.1.0+)
- **Quarterly Partitioning**: Epic creation-time based data partitioning for performance (v1.1.0+)

### Key Components

- **Read Tools** (`src/tools/epic-tools.ts`): 7 tools that receive cached sheet data
- **Write Tools** (`src/tools/epic-write-tools.ts`): 9 tools that receive GoogleSheetsClient instance
- **GoogleSheetsClient** (`src/sheets/sheets-client.ts`): Handles all Google Sheets API interactions with automatic migration
- **VersionManager** (`src/sheets/sheets-client.ts`): Manages schema versions and automatic migrations
- **Data Parser** (`src/sheets/parser.ts`): Converts CSV data to typed objects
- **Config Module** (`src/config.ts`): Version management and quarterly utility functions

### Data Flow Patterns

**Read Operations**: Client → MCP Server → Auto Migration Check → Tool Handler → Cached Data (Current Quarter) → Formatted Response
**Write Operations**: Client → MCP Server → Auto Migration Check → Tool Handler → Sheets Client → Target Quarter Sheet → Cache Invalidation

### Migration Flow (Automatic)

**Version Check**: Every tool call triggers version comparison (package.json vs _Metadata sheet)
**Migration Execution**: If versions differ, automatic migration runs (e.g., 1.0.2 → 1.1.0)
**Data Restructuring**: Existing data moved to quarterly partitions, new structure activated
**Performance Optimization**: Immediate 90% improvement in query performance

### Google Sheets Structure (v1.1.0+)

**Core Sheets:**
- **Epics**: Core epic information with `created_quarter` field (epic_id, epic_name, assignees, dates, status, created_quarter)
- **Epic_Status**: Real-time progress tracking per platform (ios_progress, android_progress, js_progress)
- **_Metadata**: Schema version and migration history (key, value, updated_at)

**Quarterly Partition Sheets (Dynamic):**
- **Status_Updates_YYYY_QQ**: Quarterly partitioned status updates (e.g., Status_Updates_2024_Q3)
- **Status_Updates**: Legacy sheet (gradually emptied after migration)

**Migration Behavior:**
- New epics automatically assigned to current quarter (e.g., 2024_Q3)
- Status updates routed to appropriate quarterly sheet based on epic's `created_quarter`
- Historical data accessible via epic-specific queries to correct partition

## Environment Variables

Required for full functionality:
- `SPREADSHEET_ID` - Google Sheets ID (extracted from URL)
- `GOOGLE_SERVICE_ACCOUNT_BASE64` - Base64-encoded service account JSON for write operations

Optional:
- `CACHE_DURATION` - Cache duration in milliseconds (default: 60000)

## Key Implementation Details

### Epic Identification
- Uses URL-based identification - extracts epic IDs from Atlassian URLs
- Example: `https://company.atlassian.net/browse/PROJ-123` → `PROJ-123`

### Platform-Specific Tracking
- Supports iOS, Android, and JS platforms with separate progress tracking
- All tools validate platform enum values

### Quarterly Partitioning Strategy (v1.1.0+)
- **Epic Creation Time Based**: Each epic assigned to quarter when created (immutable)
- **Current Quarter Optimization**: Default queries only load current quarter data (90% performance gain)
- **Historical Access**: Epic-specific queries automatically route to correct quarterly partition
- **Automatic Migration**: Existing data automatically migrated to appropriate quarters

### Caching Strategy
- Cached data shared across all read tools for performance  
- Cache invalidated on any write operation
- Uses batch operations (`batchGet`) to minimize API calls
- Current quarter data prioritized in cache for maximum performance

### Error Handling
- Comprehensive validation with user-friendly error messages
- Graceful fallback to individual requests if batch operations fail
- Read-only mode fallback when no service account credentials provided

### Tool Registration Pattern
Both read and write tools follow the same structure:
```typescript
{
  name: string,
  description: string,
  inputSchema: JSONSchema,
  handler: (dataOrClient, args) => Promise<ToolResponse>
}
```

Read tools receive `SheetData`, write tools receive `GoogleSheetsClient` instance.

## Version Management & Migration (v1.1.0+)

### Automatic Migration System
- **Version Detection**: Compares package.json version with _Metadata sheet schema_version
- **Zero Downtime**: Migrations run automatically on first tool call after version change
- **Data Safety**: Complete data migration before activating new features
- **Performance Optimization**: Immediate benefits after migration completion

### Migration Process (1.0.2 → 1.1.0)
1. **Column Addition**: Add `created_quarter` to Epics sheet
2. **Quarter Estimation**: Assign quarters to existing epics based on start_date or first status update
3. **Sheet Creation**: Create quarterly Status_Updates sheets (e.g., Status_Updates_2024_Q3)
4. **Data Migration**: Move all status updates to appropriate quarterly sheets
5. **Legacy Cleanup**: Clear original Status_Updates sheet
6. **Version Update**: Update _Metadata sheet with new schema version

### Performance Impact
- **Before Migration**: Loads all historical data (potentially 50,000+ rows)
- **After Migration**: Loads only current quarter data (~3,000 rows)
- **Performance Gain**: 90% reduction in query time and memory usage
- **Scalability**: System performance remains constant as data grows

### Key Functions (src/config.ts)
- `MCP_VERSION`: Current version from package.json
- `getCurrentQuarter()`: Returns current quarter string (e.g., "2024_Q3")
- `dateToQuarter(date)`: Converts date string to quarter format
- `getStatusUpdatesSheetName(quarter?)`: Returns quarterly sheet name