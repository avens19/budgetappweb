namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class ExpenseUpdated : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Expenses", "DateUpdated", c => c.DateTime(nullable: false));
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Expenses", "DateUpdated", c => c.DateTime());
        }
    }
}
