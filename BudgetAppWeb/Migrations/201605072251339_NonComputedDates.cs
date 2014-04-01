namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class NonComputedDates : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Categories", "DateCreated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Categories", "DateUpdated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Expenses", "DateUpdated", c => c.DateTime(nullable: false));
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Expenses", "DateUpdated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Categories", "DateUpdated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Categories", "DateCreated", c => c.DateTime(nullable: false));
        }
    }
}
