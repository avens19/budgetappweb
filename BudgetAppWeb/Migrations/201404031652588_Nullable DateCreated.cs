namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class NullableDateCreated : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Budgets", "CreatedDate", c => c.DateTime());
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime());
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Budgets", "CreatedDate", c => c.DateTime(nullable: false));
        }
    }
}
