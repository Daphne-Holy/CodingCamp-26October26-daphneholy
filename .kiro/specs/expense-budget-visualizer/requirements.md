# Requirements Document

## Introduction

The Expense & Budget Visualizer is a standalone web application that lets a user record expense transactions, set a monthly budget, and visualize spending distribution by category. The application is built with HTML, CSS, and Vanilla JavaScript without any frontend frameworks, and stores all data client-side using the browser Local Storage API. A pie chart of spending distribution is rendered using Chart.js loaded from a Content Delivery Network. The application uses a single light theme with a clean, minimal interface and works in modern browsers.

The budget model is monthly: the user sets a monthly budget, and the application tracks the remaining budget, which equals the monthly budget minus total expenses. The application warns the user when spending approaches or exceeds the budget limit.

## Glossary

- **App**: The Expense & Budget Visualizer standalone web application.
- **Monthly Budget**: A positive monetary amount, set by the user, representing the spending limit for a given month.
- **Total Expenses**: The sum of the Amount values of all stored Transactions.
- **Remaining Budget**: The Monthly Budget minus Total Expenses, displayed at the top of the interface.
- **Transaction**: A single expense record consisting of an Item Name, an Amount, and a Category.
- **Item Name**: A text label identifying a Transaction.
- **Amount**: A positive numeric monetary value of a Transaction.
- **Category**: A classification label assigned to a Transaction, drawn from Default Categories or Custom Categories.
- **Default Category**: One of the predefined categories Food, Transport, or Fun.
- **Custom Category**: A category created by the user in addition to the Default Categories.
- **Transaction List**: The scrollable display of all stored Transactions, showing Item Name, Amount, and Category.
- **Input Form**: The form containing fields for Item Name, Amount, and Category used to add a Transaction.
- **Pie Chart**: A Chart.js pie chart visualizing the spending distribution of Total Expenses across Categories.
- **Chart.js**: A JavaScript charting library loaded from a Content Delivery Network at runtime.
- **Content Delivery Network (CDN)**: A remote host serving the Chart.js library; requires internet access at runtime.
- **Local Storage API**: The browser-provided key-value storage mechanism used to persist data client-side.
- **Monthly Summary View**: A view presenting the Total Expenses and Remaining Budget for the current month.
- **Approaching-Limit Threshold**: The point at which Total Expenses are at least 80% of the Monthly Budget but do not exceed it.
- **Light Theme**: A single visual theme with a light background and minimal styling; no dark-mode toggle is provided.

## Requirements

### Requirement 1: Transaction Input

**User Story:** As a user, I want to add an expense transaction with an item name, amount, and category, so that I can record my spending.

#### Acceptance Criteria

1. THE App SHALL provide an Input Form containing fields for Item Name, Amount, and Category.
2. WHERE the Category field is displayed, THE App SHALL prepopulate the field with the Default Categories of Food, Transport, and Fun plus any stored Custom Categories.
3. WHEN the user submits the Input Form with Item Name, Amount, and Category all filled, THE App SHALL create a Transaction and add the Transaction to the Transaction List.
4. WHEN the user submits the Input Form, THE App SHALL validate that the Amount is a positive number greater than 0 and at most 999,999,999.99.
5. IF the user submits the Input Form with any field empty, with an Item Name exceeding 100 characters, or with an Amount that is not a positive number greater than 0 and at most 999,999,999.99, THEN THE App SHALL reject the submission and display a validation message identifying the invalid field.

### Requirement 2: Transaction List Management

**User Story:** As a user, I want to view, sort, and delete my recorded transactions, so that I can review and maintain my spending records.

#### Acceptance Criteria

1. THE App SHALL display a scrollable Transaction List showing the Item Name, Amount, and Category of each stored Transaction, with the most recently added Transaction displayed first before any sorting is applied.
2. WHEN the user selects the delete action on a Transaction, THE App SHALL remove that Transaction from the Transaction List and from the data stored in the Local Storage API.
3. WHEN the user requests sorting by Amount, THE App SHALL reorder the Transaction List by Amount in ascending order by default and toggle to descending order on a re-request of the same sort.
4. WHEN the user requests sorting by Category, THE App SHALL reorder the Transaction List alphabetically by Category in ascending order by default and toggle to descending order on a re-request of the same sort.
5. IF the delete action fails to remove the Transaction from the Local Storage API, THEN THE App SHALL retain the Transaction in the Transaction List and display an error message.
6. WHERE the Transaction List contains no Transactions, THE App SHALL display an empty-state message indicating no transactions have been recorded.

### Requirement 3: Monthly Budget Setting

**User Story:** As a user, I want to set a monthly budget, so that the application can track my remaining balance.

#### Acceptance Criteria

1. THE App SHALL provide a control for the user to set the Monthly Budget as a positive monetary amount between 0.01 and 999,999,999.99 with at most 2 decimal places.
2. WHEN the user sets or updates the Monthly Budget, THE App SHALL persist the Monthly Budget value to the Local Storage API so that the value is retained across browser sessions.
3. WHEN the user sets or updates the Monthly Budget, THE App SHALL recalculate the Remaining Budget as the Monthly Budget minus the recorded expenses and update the displayed balance.
4. IF the user enters a value that is not a positive monetary amount between 0.01 and 999,999,999.99 with at most 2 decimal places, THEN THE App SHALL reject the entry and display a validation message indicating the Monthly Budget must be a positive amount.
5. IF the Local Storage API is unavailable when persisting the Monthly Budget, THEN THE App SHALL display an error message indicating the budget cannot be saved and retain the current Monthly Budget value in the interface.

### Requirement 4: Remaining Budget and Warnings

**User Story:** As a user, I want to see my remaining budget and be warned when spending approaches or exceeds my budget, so that I can manage my spending.

#### Acceptance Criteria

1. THE App SHALL display the Remaining Budget at the top of the interface, calculated as the Monthly Budget minus Total Expenses.
2. WHEN a Transaction is added or deleted, THE App SHALL recalculate and update the Remaining Budget automatically.
3. WHILE Total Expenses are at or above 80% of the Monthly Budget, THE App SHALL display an approaching-limit warning.
4. IF Total Expenses exceed the Monthly Budget, THEN THE App SHALL display an overspend warning and display the Remaining Budget as a negative value.

### Requirement 5: Category Management

**User Story:** As a user, I want to use default categories and add my own custom categories, so that I can classify my expenses appropriately.

#### Acceptance Criteria

1. THE App SHALL provide the Default Categories of Food, Transport, and Fun.
2. WHEN the user adds a Custom Category with a name between 1 and 50 characters and the number of existing Custom Categories is less than 100, THE App SHALL persist the Custom Category to the Local Storage API and add the Custom Category to the Category field of the Input Form.
3. WHEN the App loads, THE App SHALL load all stored Custom Categories from the Local Storage API and make the Custom Categories available in the Category field.
4. IF the user submits a Custom Category with an empty name, a name exceeding 50 characters, or when 100 Custom Categories already exist, THEN THE App SHALL reject the Custom Category and display an error message indicating the category cannot be added.
5. IF the user adds a Custom Category with a name that matches the name of an existing Default Category or Custom Category, THEN THE App SHALL reject the Custom Category and display an error message indicating a duplicate category name.
6. IF the Local Storage API is unavailable when persisting or loading Custom Categories, THEN THE App SHALL display an error message indicating categories cannot be saved or loaded and retain the Default Categories in the Category field.

### Requirement 6: Spending Distribution Chart

**User Story:** As a user, I want to see a pie chart of my spending distribution by category, so that I can visualize where my money goes.

#### Acceptance Criteria

1. THE App SHALL render a Pie Chart of the spending distribution of Total Expenses across Categories using Chart.js loaded from a Content Delivery Network, with each slice's size proportional to the Total Expenses of its corresponding Category.
2. WHEN a Transaction is added, deleted, or modified, THE App SHALL update the Pie Chart without requiring a page reload to reflect the current spending distribution.
3. WHERE the Transaction List is empty, THE App SHALL display an empty-state message indicating no spending data is available.

### Requirement 7: Data Persistence

**User Story:** As a user, I want my data to persist across browser sessions, so that I do not lose my records when I close the browser.

#### Acceptance Criteria

1. THE App SHALL store all Transactions, the Monthly Budget, and all Custom Categories in the Local Storage API.
2. WHEN the App loads, THE App SHALL read the stored Transactions, Monthly Budget, and Custom Categories from the Local Storage API and populate the interface with the stored data.
3. WHEN a Transaction, Monthly Budget, or Custom Category changes, THE App SHALL write the updated data to the Local Storage API.
4. WHEN the App loads and no data exists in the Local Storage API, THE App SHALL initialize with an empty Transaction List, a Monthly Budget of zero, and the Default Categories.
5. WHEN the App loads and encounters corrupted or unparseable data in the Local Storage API, THE App SHALL discard the invalid data, initialize with default values, and display an error message indicating stored data could not be loaded.
6. IF a write to the Local Storage API fails due to quota exceeded or other error, THEN THE App SHALL retain the current data in the interface and display an error message indicating the data could not be saved.

### Requirement 8: Monthly Summary View

**User Story:** As a user, I want a monthly summary view, so that I can review my spending for the current month.

#### Acceptance Criteria

1. THE App SHALL provide a Monthly Summary View displaying the Total Expenses as the sum of all Transaction Amounts for the current calendar month, and the Remaining Budget as the Monthly Budget minus Total Expenses.
2. WHEN a Transaction is added, deleted, or edited, THE App SHALL update the Monthly Summary View without requiring a page reload.
3. IF the Monthly Budget has not been set, THEN THE App SHALL display a message in the Monthly Summary View indicating the user must set a Monthly Budget.

### Requirement 9: Technology Stack and File Structure

**User Story:** As a developer, I want the app built with a constrained technology stack and file structure, so that the application remains simple and backend-free.

#### Acceptance Criteria

1. THE App SHALL be implemented with HTML for structure, CSS for styling, and Vanilla JavaScript for logic, without any frontend frameworks.
2. THE App SHALL consist of exactly one HTML file at the project root, exactly one CSS file located inside the css/ directory, and exactly one JavaScript file located inside the js/ directory.
3. THE App SHALL not require a backend server; all data shall be stored client-side using the Local Storage API.
4. WHERE the Pie Chart is rendered, THE App SHALL load Chart.js from a Content Delivery Network; Chart.js is a library and is not a framework.
5. IF the Chart.js library fails to load from the Content Delivery Network, THEN THE App SHALL display an error message in the chart area and preserve all other functionality.
6. IF the Local Storage API is unavailable, THEN THE App SHALL display an error message and retain any data currently held in memory.

### Requirement 10: Browser Compatibility

**User Story:** As a user, I want the app to run in my preferred modern browser, so that I can use the application without installing special software.

#### Acceptance Criteria

1. THE App SHALL load and respond to user interaction in the latest 2 major versions of Chrome, Firefox, Edge, and Safari.
2. WHILE internet access is available, WHEN the App renders the Pie Chart, THE App SHALL load Chart.js from the Content Delivery Network.
3. IF internet access is unavailable or the Chart.js library cannot be loaded from the Content Delivery Network, THEN THE App SHALL display an error message in the chart area and preserve all other App functionality.

### Requirement 11: Visual Theme

**User Story:** As a user, I want a clean, minimal light-themed interface, so that the application is easy to read and use.

#### Acceptance Criteria

1. THE App SHALL apply a single Light Theme with a light background maintaining a contrast ratio of at least 4.5:1 between background and foreground text, and minimal styling with no decorative background images or gradients.
2. THE App SHALL use readable typography with a minimum body font size of 16 pixels and a clear visual hierarchy with at least 3 heading levels each differing by at least 25% in font size.
3. THE App SHALL not provide a dark-mode toggle.

### Requirement 12: Performance

**User Story:** As a user, I want fast, responsive interactions, so that updating data does not introduce noticeable lag.

#### Acceptance Criteria

1. THE App SHALL fully render and make the initial interface interactive within 2 seconds on Chrome, Firefox, Edge, or Safari.
2. WHILE the Transaction List contains up to 1,000 Transactions, WHEN a Transaction is added or deleted, THE App SHALL update the Remaining Budget, the Transaction List, and the Pie Chart within 100 milliseconds.
3. WHILE the Transaction List contains up to 1,000 Transactions, WHEN the user requests sorting of the Transaction List, THE App SHALL reorder the list within 100 milliseconds.
