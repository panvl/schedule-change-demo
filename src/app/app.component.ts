import { Component, OnInit, ViewChild } from '@angular/core';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { IntercomService } from './intercom.service';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import pLimit from 'p-limit';
import { HttpClientModule, HttpErrorResponse } from '@angular/common/http';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    CommonModule,
    FormsModule,
    HttpClientModule
  ]
})
export class AppComponent implements OnInit {
  // Our final displayed columns
  displayedColumns: string[] = [
    'Name',
    'Email',
    'Phone',
    'Original Schedule Date',
    'New Schedule Date',
    'ContactedInIntercom',
    'ConversationCount',
    'Priority',
    'DateChangeMagnitude',
    'TicketStatus',
    'Actions'
  ];

  // Material data source
  dataSource = new MatTableDataSource<any>([]);
  mergedData: any[] = [];

  isFetching: boolean = false;
  isStopped: boolean = false;
  rowsFetched: number = 0;
  totalRows: number = 0;
  fetchStatus: string = '';

  @ViewChild(MatPaginator, { static: true }) paginator!: MatPaginator;
  @ViewChild(MatSort, { static: true }) sort!: MatSort;

  // Define pageSizeOptions as a separate property
  pageSizeOptions: number[] = [20, 50, 100, 500]; // 500 as a default "All" option

  // Add a fixed current date for testing
  currentDate: Date = new Date('2024-01-01');

  // Filter object
  filters = {
    contacted: '',
    minConversations: null as number | null,
    priority: '',
    magnitude: '',
    ticketStatus: ''
  };

  // Dynamic filter options
  contactedOptions: string[] = [];
  priorityOptions: string[] = [];
  magnitudeOptions: string[] = [];
  ticketStatusOptions: string[] = [];

  constructor(private intercomService: IntercomService) {}

  ngOnInit(): void {
    // Set up sorting & pagination
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.sort.active = 'Original Schedule Date';
    this.sort.direction = 'asc';
    this.sort.sortChange.emit();

    // Set up custom filter predicate
    this.dataSource.filterPredicate = this.createFilter();
  }

  // 1. Handle CSV File Selection
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const parsed = results.data.filter((row: any) => row.Email);
        this.mergedData = parsed.map((row: any) => {
          return {
            ...row,
            // Initialize new fields
            Name: row.Name,
            Phone: row['Phone Number'],
            TicketStatus: row['Ticket Status'],
            ContactedInIntercom: 'Unknown',
            ConversationCount: 0,
            Priority: this.calculatePriority(row['Original Schedule Date']),
            DateChangeMagnitude: this.calculateDateDifference(
              row['Original Schedule Date'],
              row['New Schedule Date']
            )
          };
        });

        // Extract unique filter options
        this.extractFilterOptions();
        this.applyFilters();

        // Update pageSizeOptions to include 'All' (represented by mergedData.length)
        this.pageSizeOptions = [20, 50, 100, this.mergedData.length];

        // Update Material table data
        this.dataSource.data = this.mergedData;
      }
    });
  }

  // 2. Calculate Priority (based on how soon the new date is)
  calculatePriority(originalScheduleDate: string): string {
    if (!originalScheduleDate) return 'Unknown';

    // Use the fixed currentDate instead of new Date()
    const now = this.currentDate;
    const oDate = new Date(originalScheduleDate);
    const diffDays = Math.floor(
      (oDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= 10) return 'Immediate';
    if (diffDays <= 30) return 'Very High';
    if (diffDays <= 60) return 'High';
    if (diffDays <= 90) return 'Medium';
    return 'Low';
  }

  // 3. Calculate Date Change Magnitude (based on difference from original)
  calculateDateDifference(originalDate: string, newDate: string): string {
    if (!originalDate || !newDate) return 'Unknown';
    const oDate = new Date(originalDate);
    const nDate = new Date(newDate);
    const diffDays = Math.abs(
      Math.floor((nDate.getTime() - oDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    if (diffDays <= 7) return 'Minor';
    if (diffDays <= 14) return 'Moderate';
    return 'Major';
  }

  // 4. Fetch Intercom Data in Batches
  async fetchIntercomData() {
    if (!this.mergedData.length || this.isFetching) return;

    this.isFetching = true;
    this.isStopped = false;
    this.rowsFetched = 0;
    this.totalRows = this.mergedData.length;
    this.fetchStatus = 'Starting batch fetch...';

    const chunkSize = 1; // Adjust based on safety
    const concurrency = 1; // Adjust based on safety
    const limit = pLimit(concurrency);
    let currentIndex = 0;

    const tasks = [];

    while (currentIndex < this.mergedData.length && !this.isStopped) {
      const batch = this.mergedData.slice(currentIndex, currentIndex + chunkSize);
      tasks.push(limit(() => this.processBatch(batch)));
      currentIndex += chunkSize;
    }

    try {
      await Promise.all(tasks);
      if (!this.isStopped) {
        this.fetchStatus = 'All Intercom fetches completed.';
      }
    } catch (error) {
      console.error('Error fetching Intercom data:', error);
      this.fetchStatus = 'Error fetching Intercom data. Check console for details.';
    } finally {
      this.isFetching = false;
    }
  }

  stopFetch() {
    this.isStopped = true;
    this.fetchStatus = 'Fetch operation stopped by user.';
  }

  async processBatch(batch: any[]) {
    await Promise.all(
      batch.map(async (row) => {
        if (this.isStopped) return; // Check if fetching has been stopped
        const email = row.Email;
        if (!email) return;

        try {
          const contactResp = await this.intercomService.searchContactByEmail(email).toPromise();
          if (contactResp.total_count > 0) {
            const contact = contactResp.data[0];
            row.ContactedInIntercom = 'Yes';
            row.IntercomID = contact.id;

            const convResp = await this.intercomService.searchConversationsByContactId(contact.id).toPromise();
            row.ConversationCount = convResp.total_count || 0;
          } else {
            row.ContactedInIntercom = 'No';
            row.IntercomID = '';
            row.ConversationCount = 0;
          }
        } catch (err: unknown) {
          if (err instanceof HttpErrorResponse) {
            if (err.status === 429) {
              console.warn('Rate limit exceeded. Consider reducing concurrency or implementing additional backoff.');
            }
            console.error('Intercom error for email:', email, err);
          } else {
            console.error('Unexpected error:', err);
          }
          row.ContactedInIntercom = 'Error';
        } finally {
          this.rowsFetched++; // Increment the fetched rows count
        }
      })
    );

    // Update table and filters after each batch
    this.dataSource.data = [...this.dataSource.data];
    this.extractFilterOptions();
    this.applyFilters();
  }

  // 5. Export to Excel
  exportToExcel() {
    if (!this.dataSource.filteredData.length) {
      alert('No data to export!');
      return;
    }

    // Filter out the IntercomID field
    const filteredData = this.dataSource.filteredData.map(({ IntercomID, ...rest }) => rest);

    // Sort the data by "Original Schedule Date"
    filteredData.sort((a, b) => {
      const dateA = new Date(a['Original Schedule Date']);
      const dateB = new Date(b['Original Schedule Date']);
      return dateA.getTime() - dateB.getTime();
    });

    // Convert sorted data to worksheet
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ScheduleChangeData');

    // Generate filename with filter info
    const filename = `schedule_change_filtered_${this.generateFilterInfo()}.xlsx`;

    // Download the Excel file
    XLSX.writeFile(wb, filename);
  }

  // Export to CSV
  exportToCSV() {
    const csv = Papa.unparse(this.dataSource.filteredData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // Generate filename with filter info
    const filename = `schedule_change_filtered_${this.generateFilterInfo()}.csv`;

    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export to JSON
  exportToJSON() {
    const json = JSON.stringify(this.dataSource.filteredData, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // Generate filename with filter info
    const filename = `schedule_change_filtered_${this.generateFilterInfo()}.json`;

    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Helper function to generate filter info for filename
  generateFilterInfo(): string {
    const { contacted, minConversations, priority, magnitude, ticketStatus } = this.filters;
    const filterInfo = [];

    if (contacted && contacted !== 'all') filterInfo.push(`cont_${contacted}`);
    if (minConversations !== null) filterInfo.push(`conv_${minConversations}`);
    if (priority && priority !== 'all') filterInfo.push(`pr_${priority}`);
    if (magnitude && magnitude !== 'all') filterInfo.push(`magn_${magnitude}`);
    if (ticketStatus && ticketStatus !== 'all') filterInfo.push(`stat_${ticketStatus}`);

    return filterInfo.join('_') || 'all';
  }
  // Sleep utility
  sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 6. Fetch Intercom Data for a Single Row (Existing Method)
  fetchIntercomDataForRow(row: any): void {
    this.intercomService.searchContactByEmail(row.Email).subscribe(contactResp => {
      if (contactResp?.total_count > 0) {
        const contact = contactResp.data[0];
        row.ContactedInIntercom = 'Yes';
        row.IntercomID = contact.id;

        // Optionally, fetch conversations for that contact
        this.intercomService.searchConversationsByContactId(contact.id).subscribe(convResp => {
          row.ConversationCount = convResp.total_count || 0;
          // Update the table data to reflect changes
          this.dataSource.data = [...this.dataSource.data];
          this.extractFilterOptions();
          this.applyFilters();
        });

      } else {
        row.ContactedInIntercom = 'No';
        row.IntercomID = '';
        row.ConversationCount = 0;
        // Update the table data to reflect changes
        this.dataSource.data = [...this.dataSource.data];
        this.extractFilterOptions();
        this.applyFilters();
      }
    }, err => {
      console.error('Intercom error for email:', row.Email, err);
      row.ContactedInIntercom = 'Error';
      // Update the table data to reflect changes
      this.dataSource.data = [...this.dataSource.data];
      this.extractFilterOptions();
      this.applyFilters();
    });
  }

  // 7. Apply Filters
  applyFilters() {
    this.dataSource.filter = JSON.stringify(this.filters);
  }

  // 8. Clear Filters
  clearFilters() {
    this.filters = {
      contacted: '',
      minConversations: null,
      priority: '',
      magnitude: '',
      ticketStatus: ''
    };
    this.applyFilters();
  }

  // 9. Create Custom Filter Predicate
  createFilter(): (data: any, filter: string) => boolean {
    let filterFunction = function(data: any, filter: string): boolean {
      let searchTerms = JSON.parse(filter);

      // Contacted Filter
      if (searchTerms.contacted && data.ContactedInIntercom !== searchTerms.contacted) {
        return false;
      }

      // Priority Filter
      if (searchTerms.priority && data.Priority !== searchTerms.priority) {
        return false;
      }

      // Magnitude Filter
      if (searchTerms.magnitude && data.DateChangeMagnitude !== searchTerms.magnitude) {
        return false;
      }

      // Ticket Status Filter
      if (searchTerms.ticketStatus && data.TicketStatus !== searchTerms.ticketStatus) {
        return false;
      }

      // Min Conversations Filter
      if (searchTerms.minConversations !== null && data.ConversationCount < searchTerms.minConversations) {
        return false;
      }

      return true;
    };
    return filterFunction;
  }

  // 10. Extract Unique Filter Options from Data
  extractFilterOptions() {
    // Extract unique values for ContactedInIntercom
    this.contactedOptions = Array.from(new Set(this.mergedData.map(row => row.ContactedInIntercom))).filter(val => val);

    // Extract unique values for Priority
    this.priorityOptions = Array.from(new Set(this.mergedData.map(row => row.Priority))).filter(val => val);

    // Extract unique values for DateChangeMagnitude
    this.magnitudeOptions = Array.from(new Set(this.mergedData.map(row => row.DateChangeMagnitude))).filter(val => val);

    // Extract unique values for TicketStatus
    this.ticketStatusOptions = Array.from(new Set(this.mergedData.map(row => row.TicketStatus))).filter(val => val);
  }
}
