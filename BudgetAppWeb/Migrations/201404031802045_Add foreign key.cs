namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class Addforeignkey : DbMigration
    {
        public override void Up()
        {
            RenameColumn(table: "dbo.Expenses", name: "Budget_UniqueId", newName: "BudgetId");
            RenameIndex(table: "dbo.Expenses", name: "IX_Budget_UniqueId", newName: "IX_BudgetId");
        }
        
        public override void Down()
        {
            RenameIndex(table: "dbo.Expenses", name: "IX_BudgetId", newName: "IX_Budget_UniqueId");
            RenameColumn(table: "dbo.Expenses", name: "BudgetId", newName: "Budget_UniqueId");
        }
    }
}
