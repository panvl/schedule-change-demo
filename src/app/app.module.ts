import { BrowserModule } from '@angular/platform-browser';
import { NgModule, importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

// Angular Material
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AppComponent } from './app.component';
import { IntercomService } from './intercom.service';

@NgModule({
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    BrowserAnimationsModule,

    // Material modules
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatProgressSpinnerModule,

    // Import standalone component
    AppComponent
  ],
  providers: [IntercomService],
})
export class AppModule {}
